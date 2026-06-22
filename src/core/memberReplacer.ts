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

        // Process members in parallel batches of 5
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
            const content = await MemberReplacer.readMember(memberPath, connection);
            console.log(`[MemberReplacer] read content length: ${content?.length ?? 'null'} chars`);

            if (content === null) {
                return {
                    memberPath,
                    lineResults: Array.from(selectedLines).map(lineNumber => ({
                        memberPath,
                        lineNumber,
                        status: 'failed' as const,
                        error: 'Failed to read member'
                    })),
                    error: 'Failed to read member'
                };
            }

            const lines = content.split('\n');
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
                const newContent = lines.join('\n');
                const writeOk = await MemberReplacer.writeMember(memberPath, newContent, connection);
                console.log(`[MemberReplacer] write result: ${writeOk}`);

                if (!writeOk) {
                    return {
                        memberPath,
                        lineResults: lineResults.map(r => ({
                            ...r,
                            status: 'failed' as const,
                            error: 'Failed to write member'
                        })),
                        error: 'Failed to write member'
                    };
                }
            }

            console.log(`[MemberReplacer] done with ${memberPath}, results:`, lineResults.map(r => `line ${r.lineNumber}=${r.status}`));
            return { memberPath, lineResults };

        } catch (err: any) {
            console.error(`[MemberReplacer] caught error for ${memberPath}:`, err?.message);
            if (err?.message?.includes('Permission denied') || err?.message?.includes('authority')) {
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

    /**
     * Read member content. Tries the Code for IBM i content API first (handles CCSID),
     * falls back to PASE cat command if unavailable.
     */
    private static async readMember(memberPath: string, connection: IBMiConnection): Promise<string | null> {
        const content = connection.getContent();

        // Try Code for IBM i content API (handles CCSID conversion properly)
        if (content && typeof content.downloadStreamFile === 'function') {
            try {
                console.log(`[MemberReplacer] reading via downloadStreamFile: ${memberPath}`);
                const data: string = await content.downloadStreamFile(memberPath);
                console.log(`[MemberReplacer] downloadStreamFile returned ${data?.length ?? 'null'} chars`);
                return data ?? null;
            } catch (e: any) {
                console.log(`[MemberReplacer] downloadStreamFile failed: ${e?.message}, falling back to cat`);
            }
        }

        // Fallback: PASE cat
        console.log(`[MemberReplacer] reading via cat: ${memberPath}`);
        const readResult = await connection.sendCommand({
            command: `cat "${memberPath}"`,
            environment: 'pase'
        });
        console.log(`[MemberReplacer] cat exit code: ${readResult.code}, stdout length: ${readResult.stdout?.length ?? 0}`);
        if (readResult.stderr) {
            console.log(`[MemberReplacer] cat stderr: ${readResult.stderr}`);
        }

        if (readResult.code !== 0) {
            return null;
        }
        return readResult.stdout;
    }

    /**
     * Write member content. Tries the Code for IBM i content API first,
     * falls back to base64/printf via PASE.
     */
    private static async writeMember(memberPath: string, content: string, connection: IBMiConnection): Promise<boolean> {
        const contentApi = connection.getContent();

        // Try Code for IBM i content API
        if (contentApi && typeof contentApi.writeStreamFile === 'function') {
            try {
                console.log(`[MemberReplacer] writing via writeStreamFile: ${memberPath}`);
                await contentApi.writeStreamFile(memberPath, content);
                console.log(`[MemberReplacer] writeStreamFile succeeded`);
                return true;
            } catch (e: any) {
                console.log(`[MemberReplacer] writeStreamFile failed: ${e?.message}, falling back to base64`);
            }
        }

        // Fallback: base64/printf via PASE
        console.log(`[MemberReplacer] writing via base64: ${memberPath}`);
        const b64 = Buffer.from(content).toString('base64');
        const writeResult = await connection.sendCommand({
            command: `printf '%s' "${b64}" | base64 -d > "${memberPath}"`,
            environment: 'pase'
        });
        console.log(`[MemberReplacer] base64 write exit code: ${writeResult.code}`);
        if (writeResult.stderr) {
            console.log(`[MemberReplacer] base64 write stderr: ${writeResult.stderr}`);
        }

        if (writeResult.code !== 0) {
            if (writeResult.stderr?.includes('Permission denied')) {
                throw new Error('Permission denied');
            }
            return false;
        }
        return true;
    }

    private static replaceAllCaseInsensitive(str: string, search: string, replace: string): string {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return str.replace(new RegExp(escaped, 'gi'), replace);
    }
}
