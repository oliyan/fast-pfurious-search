import { ReplaceRequest, ReplaceResult, OccurrenceResult, IBMiConnection } from '../types/interfaces';
import { ConnectionManager } from './connectionManager';

const BATCH_SIZE = 5;

export class MemberReplacer {
    static async executeReplace(
        request: ReplaceRequest,
        connection: IBMiConnection,
        onProgress: (result: ReplaceResult) => void
    ): Promise<void> {
        // Group selected occurrences by memberPath
        const memberLineMap = new Map<string, Set<number>>();
        for (const occ of request.selectedOccurrences) {
            if (!memberLineMap.has(occ.memberPath)) {
                memberLineMap.set(occ.memberPath, new Set());
            }
            memberLineMap.get(occ.memberPath)!.add(occ.lineNumber);
        }

        const members = Array.from(memberLineMap.entries());

        // Process members in parallel batches of 5 (same pattern as fastPfuriousExecutor.ts)
        for (let i = 0; i < members.length; i += BATCH_SIZE) {
            const batch = members.slice(i, i + BATCH_SIZE);
            await Promise.allSettled(
                batch.map(([memberPath, selectedLines]) =>
                    MemberReplacer.processMember(memberPath, selectedLines, request, connection)
                        .then(result => onProgress(result))
                        .catch(err => {
                            onProgress({
                                memberPath,
                                lineResults: [],
                                error: err?.message || 'Unknown error'
                            });
                        })
                )
            );
        }
    }

    private static async processMember(
        memberPath: string,
        selectedLines: Set<number>,
        request: ReplaceRequest,
        connection: IBMiConnection
    ): Promise<ReplaceResult> {
        try {
            // Read member content via cat
            const readResult = await connection.sendCommand({
                command: `cat "${memberPath}"`,
                environment: 'pase'
            });

            if (readResult.code !== 0) {
                const status = readResult.stderr?.includes('Permission denied')
                    ? 'authority_error' as const
                    : 'failed' as const;
                return {
                    memberPath,
                    lineResults: Array.from(selectedLines).map(lineNumber => ({
                        memberPath,
                        lineNumber,
                        status,
                        error: status === 'failed' ? (readResult.stderr || 'Failed to read member') : undefined
                    }))
                };
            }

            const lines = readResult.stdout.split('\n');
            const lineResults: OccurrenceResult[] = [];
            let anyPatched = false;

            for (const lineNumber of selectedLines) {
                const idx = lineNumber - 1; // 1-based to 0-based
                if (idx < 0 || idx >= lines.length) {
                    lineResults.push({ memberPath, lineNumber, status: 'not_found' });
                    continue;
                }

                const original = lines[idx];
                const found = request.caseSensitive
                    ? original.includes(request.searchTerm)
                    : original.toLowerCase().includes(request.searchTerm.toLowerCase());

                if (!found) {
                    lineResults.push({ memberPath, lineNumber, status: 'not_found' });
                    continue;
                }

                // Replace ALL occurrences on this line (case-aware)
                const replaced = request.caseSensitive
                    ? original.split(request.searchTerm).join(request.replaceTerm)
                    : MemberReplacer.replaceAllCaseInsensitive(original, request.searchTerm, request.replaceTerm);

                lines[idx] = replaced;
                anyPatched = true;

                const status = replaced.trimEnd().length > 80
                    ? 'replaced_with_truncation_risk' as const
                    : 'replaced' as const;

                lineResults.push({ memberPath, lineNumber, status });
            }

            if (anyPatched) {
                // Base64-encode the modified content and write it back.
                // NOTE: IBM i SRCPF records have a fixed 92-byte width (6 seq + 6 date + 80 data).
                // Reading via `cat` and writing via `printf | base64 -d` operates on stream bytes,
                // so trailing spaces in fixed-width source records may not be preserved after
                // write-back. Verify behaviour on a live SRCPF before relying on this in production.
                const b64 = Buffer.from(lines.join('\n')).toString('base64');
                const writeResult = await connection.sendCommand({
                    command: `printf '%s' "${b64}" | base64 -d > "${memberPath}"`,
                    environment: 'pase'
                });

                if (writeResult.code !== 0) {
                    if (writeResult.stderr?.includes('Permission denied')) {
                        return {
                            memberPath,
                            lineResults: lineResults.map(r => ({
                                ...r,
                                status: 'authority_error' as const,
                                error: undefined
                            }))
                        };
                    }
                    throw new Error(writeResult.stderr || 'Failed to write member');
                }
            }

            return { memberPath, lineResults };

        } catch (err: any) {
            if (err?.message?.includes('Permission denied')) {
                return {
                    memberPath,
                    lineResults: Array.from(selectedLines).map(lineNumber => ({
                        memberPath,
                        lineNumber,
                        status: 'authority_error' as const
                    }))
                };
            }
            return {
                memberPath,
                lineResults: Array.from(selectedLines).map(lineNumber => ({
                    memberPath,
                    lineNumber,
                    status: 'failed' as const,
                    error: err?.message || 'Unknown error'
                })),
                error: err?.message || 'Unknown error'
            };
        }
    }

    private static replaceAllCaseInsensitive(str: string, search: string, replace: string): string {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return str.replace(new RegExp(escaped, 'gi'), replace);
    }
}
