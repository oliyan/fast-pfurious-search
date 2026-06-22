import { ReplaceRequest, ReplaceResult, OccurrenceResult, IBMiConnection } from '../types/interfaces';
import { ConnectionManager } from './connectionManager';

const BATCH_SIZE = 5;

export class MemberReplacer {
    static async executeReplace(
        request: ReplaceRequest,
        connection: IBMiConnection,
        onProgress: (result: ReplaceResult) => void
    ): Promise<void> {
        console.log('[MemberReplacer] executeReplace called');
        console.log('[MemberReplacer] searchTerm:', JSON.stringify(request.searchTerm));
        console.log('[MemberReplacer] replaceTerm:', JSON.stringify(request.replaceTerm));
        console.log('[MemberReplacer] caseSensitive:', request.caseSensitive);
        console.log('[MemberReplacer] selectedOccurrences count:', request.selectedOccurrences.length);

        // Group selected occurrences by memberPath
        const memberLineMap = new Map<string, Set<number>>();
        for (const occ of request.selectedOccurrences) {
            if (!memberLineMap.has(occ.memberPath)) {
                memberLineMap.set(occ.memberPath, new Set());
            }
            memberLineMap.get(occ.memberPath)!.add(occ.lineNumber);
        }

        console.log('[MemberReplacer] unique members to process:', memberLineMap.size);

        const members = Array.from(memberLineMap.entries());

        // Process members in parallel batches of 5 (same pattern as fastPfuriousExecutor.ts)
        for (let i = 0; i < members.length; i += BATCH_SIZE) {
            const batch = members.slice(i, i + BATCH_SIZE);
            await Promise.allSettled(
                batch.map(([memberPath, selectedLines]) =>
                    MemberReplacer.processMember(memberPath, selectedLines, request, connection)
                        .then(result => onProgress(result))
                        .catch(err => {
                            console.error('[MemberReplacer] unhandled error for', memberPath, err?.message);
                            onProgress({
                                memberPath,
                                lineResults: [],
                                error: err?.message || 'Unknown error'
                            });
                        })
                )
            );
        }

        console.log('[MemberReplacer] executeReplace complete');
    }

    private static async processMember(
        memberPath: string,
        selectedLines: Set<number>,
        request: ReplaceRequest,
        connection: IBMiConnection
    ): Promise<ReplaceResult> {
        console.log(`[MemberReplacer] processing member: ${memberPath}`);
        console.log(`[MemberReplacer] selected lines:`, Array.from(selectedLines));

        try {
            // Read member content via cat
            const readResult = await connection.sendCommand({
                command: `cat "${memberPath}"`,
                environment: 'pase'
            });

            console.log(`[MemberReplacer] cat exit code: ${readResult.code}`);
            if (readResult.stderr) {
                console.log(`[MemberReplacer] cat stderr: ${readResult.stderr}`);
            }
            console.log(`[MemberReplacer] cat stdout length: ${readResult.stdout?.length ?? 0} chars`);

            if (readResult.code !== 0) {
                const status = readResult.stderr?.includes('Permission denied')
                    ? 'authority_error' as const
                    : 'failed' as const;
                console.log(`[MemberReplacer] read failed, status: ${status}`);
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
            console.log(`[MemberReplacer] total lines in member: ${lines.length}`);

            const lineResults: OccurrenceResult[] = [];
            let anyPatched = false;

            for (const lineNumber of selectedLines) {
                const idx = lineNumber - 1; // 1-based to 0-based
                if (idx < 0 || idx >= lines.length) {
                    console.log(`[MemberReplacer] line ${lineNumber} out of range (member has ${lines.length} lines)`);
                    lineResults.push({ memberPath, lineNumber, status: 'not_found' });
                    continue;
                }

                const original = lines[idx];
                console.log(`[MemberReplacer] line ${lineNumber} content: ${JSON.stringify(original)}`);
                console.log(`[MemberReplacer] searching for: ${JSON.stringify(request.searchTerm)} (caseSensitive=${request.caseSensitive})`);

                const found = request.caseSensitive
                    ? original.includes(request.searchTerm)
                    : original.toLowerCase().includes(request.searchTerm.toLowerCase());

                console.log(`[MemberReplacer] found: ${found}`);

                if (!found) {
                    lineResults.push({ memberPath, lineNumber, status: 'not_found' });
                    continue;
                }

                // Replace ALL occurrences on this line (case-aware)
                const replaced = request.caseSensitive
                    ? original.split(request.searchTerm).join(request.replaceTerm)
                    : MemberReplacer.replaceAllCaseInsensitive(original, request.searchTerm, request.replaceTerm);

                console.log(`[MemberReplacer] line ${lineNumber} after replace: ${JSON.stringify(replaced)}`);

                lines[idx] = replaced;
                anyPatched = true;

                const status = replaced.trimEnd().length > 80
                    ? 'replaced_with_truncation_risk' as const
                    : 'replaced' as const;

                lineResults.push({ memberPath, lineNumber, status });
            }

            console.log(`[MemberReplacer] anyPatched: ${anyPatched}`);

            if (anyPatched) {
                // Base64-encode the modified content and write it back.
                // NOTE: IBM i SRCPF records have a fixed 92-byte width (6 seq + 6 date + 80 data).
                // Reading via `cat` and writing via `printf | base64 -d` operates on stream bytes,
                // so trailing spaces in fixed-width source records may not be preserved after
                // write-back. Verify behaviour on a live SRCPF before relying on this in production.
                const b64 = Buffer.from(lines.join('\n')).toString('base64');
                console.log(`[MemberReplacer] writing back to ${memberPath}, b64 length: ${b64.length}`);

                const writeResult = await connection.sendCommand({
                    command: `printf '%s' "${b64}" | base64 -d > "${memberPath}"`,
                    environment: 'pase'
                });

                console.log(`[MemberReplacer] write exit code: ${writeResult.code}`);
                if (writeResult.stderr) {
                    console.log(`[MemberReplacer] write stderr: ${writeResult.stderr}`);
                }

                if (writeResult.code !== 0) {
                    if (writeResult.stderr?.includes('Permission denied')) {
                        console.log(`[MemberReplacer] write authority_error for ${memberPath}`);
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

            console.log(`[MemberReplacer] done with ${memberPath}, results:`, lineResults.map(r => `line ${r.lineNumber}=${r.status}`));
            return { memberPath, lineResults };

        } catch (err: any) {
            console.error(`[MemberReplacer] caught error for ${memberPath}:`, err?.message);
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
