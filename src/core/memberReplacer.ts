import { ReplaceRequest, ReplaceResult, OccurrenceResult, IBMiConnection } from '../types/interfaces';
import { ConnectionManager } from './connectionManager';

const BATCH_SIZE = 5;

interface MemberLine {
    srcseq: string;  // Raw SRCSEQ value (e.g. "100.00") — used in UPDATE WHERE clause
    content: string; // SRCDTA (80-char source data)
}

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

        const memberLineMap = new Map<string, Set<number>>();
        for (const occ of request.selectedOccurrences) {
            if (!memberLineMap.has(occ.memberPath)) {
                memberLineMap.set(occ.memberPath, new Set());
            }
            memberLineMap.get(occ.memberPath)!.add(occ.lineNumber);
        }

        console.log('[MemberReplacer] unique members to process:', memberLineMap.size);

        const members = Array.from(memberLineMap.entries());

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
            const pathParts = ConnectionManager.parseMemberPath(memberPath);
            const { library, file, member } = pathParts;

            // Read via SQL: avoids IFS/PASE encoding issues entirely.
            // TRIM(CHAR(SRCSEQ)) || '|' || SRCDTA gives us "seqnum|80-char-data" per row.
            const readCmd = `db2 "SELECT TRIM(CHAR(SRCSEQ)) || '|' || SRCDTA FROM ${library}/${file} WHERE SRCMBR='${member}' ORDER BY SRCSEQ"`;
            console.log(`[MemberReplacer] reading via SQL`);
            const readResult = await connection.sendCommand({ command: readCmd, environment: 'pase' });
            console.log(`[MemberReplacer] SQL read exit: ${readResult.code}, stdout length: ${readResult.stdout?.length ?? 0}`);
            if (readResult.stderr) {
                console.log(`[MemberReplacer] SQL read stderr: ${readResult.stderr}`);
            }

            if (readResult.code !== 0) {
                const isAuth = readResult.stderr?.toLowerCase().includes('authority') ||
                               readResult.stderr?.toLowerCase().includes('permission');
                const status = isAuth ? 'authority_error' as const : 'failed' as const;
                return {
                    memberPath,
                    lineResults: Array.from(selectedLines).map(lineNumber => ({
                        memberPath, lineNumber, status,
                        error: status === 'failed' ? (readResult.stderr || 'SQL read failed') : undefined
                    })),
                    error: readResult.stderr || 'SQL read failed'
                };
            }

            // Parse db2 output.  Each data row looks like:  "100.00|source line content..."
            // Header rows (column names, dashes) either have no '|' or the part before '|' is non-numeric.
            const rows: MemberLine[] = [];
            for (const line of readResult.stdout.split('\n')) {
                const pipeIdx = line.indexOf('|');
                if (pipeIdx > 0) {
                    const seq = line.substring(0, pipeIdx).trim();
                    if (/^\d/.test(seq)) {
                        rows.push({ srcseq: seq, content: line.substring(pipeIdx + 1) });
                    }
                }
            }
            console.log(`[MemberReplacer] SQL read: ${rows.length} lines`);

            const lineResults: OccurrenceResult[] = [];

            for (const lineNumber of selectedLines) {
                const idx = lineNumber - 1; // 1-based to 0-based
                if (idx < 0 || idx >= rows.length) {
                    console.log(`[MemberReplacer] line ${lineNumber} out of range (member has ${rows.length} lines)`);
                    lineResults.push({ memberPath, lineNumber, status: 'not_found' });
                    continue;
                }

                const original = rows[idx].content.trimEnd(); // trim trailing spaces from CHAR(80)
                console.log(`[MemberReplacer] line ${lineNumber} content: ${JSON.stringify(original)}`);

                const found = request.caseSensitive
                    ? original.includes(request.searchTerm)
                    : original.toLowerCase().includes(request.searchTerm.toLowerCase());

                console.log(`[MemberReplacer] found: ${found}`);

                if (!found) {
                    lineResults.push({ memberPath, lineNumber, status: 'not_found' });
                    continue;
                }

                const replaced = request.caseSensitive
                    ? original.split(request.searchTerm).join(request.replaceTerm)
                    : MemberReplacer.replaceAllCaseInsensitive(original, request.searchTerm, request.replaceTerm);

                console.log(`[MemberReplacer] line ${lineNumber} after replace: ${JSON.stringify(replaced)}`);

                const srcseq = rows[idx].srcseq;
                const escapedContent = replaced.replace(/'/g, "''");
                const updateCmd = `db2 "UPDATE ${library}/${file} SET SRCDTA='${escapedContent}' WHERE SRCMBR='${member}' AND SRCSEQ=${srcseq}"`;
                console.log(`[MemberReplacer] updating SRCSEQ=${srcseq}`);
                const updateResult = await connection.sendCommand({ command: updateCmd, environment: 'pase' });
                console.log(`[MemberReplacer] UPDATE exit: ${updateResult.code}`);
                if (updateResult.stderr) {
                    console.log(`[MemberReplacer] UPDATE stderr: ${updateResult.stderr}`);
                }

                if (updateResult.code !== 0) {
                    const isAuth = updateResult.stderr?.toLowerCase().includes('authority') ||
                                   updateResult.stderr?.toLowerCase().includes('permission');
                    lineResults.push({
                        memberPath,
                        lineNumber,
                        status: isAuth ? 'authority_error' as const : 'failed' as const,
                        error: isAuth ? undefined : (updateResult.stderr || 'SQL update failed')
                    });
                    continue;
                }

                const status = replaced.trimEnd().length > 80
                    ? 'replaced_with_truncation_risk' as const
                    : 'replaced' as const;

                lineResults.push({ memberPath, lineNumber, status });
            }

            console.log(`[MemberReplacer] done with ${memberPath}, results:`, lineResults.map(r => `line ${r.lineNumber}=${r.status}`));
            return { memberPath, lineResults };

        } catch (err: any) {
            console.error(`[MemberReplacer] caught error for ${memberPath}:`, err?.message);
            if (err?.message?.includes('Permission denied') || err?.message?.includes('authority')) {
                return {
                    memberPath,
                    lineResults: Array.from(selectedLines).map(lineNumber => ({
                        memberPath, lineNumber, status: 'authority_error' as const
                    }))
                };
            }
            return {
                memberPath,
                lineResults: Array.from(selectedLines).map(lineNumber => ({
                    memberPath, lineNumber,
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
