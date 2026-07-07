import { ReplaceRequest, ReplaceResult, OccurrenceResult, IBMiConnection } from '../types/interfaces';
import { ConnectionManager } from './connectionManager';

const BATCH_SIZE = 5;

export class MemberReplacer {
    private static nextAliasId = 0;

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
            const { library, file, member } = ConnectionManager.parseMemberPath(memberPath);
            const content = connection.getContent();

            const aliasId = String(++MemberReplacer.nextAliasId).padStart(7, '0');
            const aliasName = `PFA${aliasId}`;

            // V7.3: CREATE OR REPLACE ALIAS not available — drop first, then create
            try {
                await content.runSQL(`DROP ALIAS QTEMP.${aliasName}`);
            } catch {
                // alias didn't exist — expected on first run
            }
            await content.runSQL(`CREATE ALIAS QTEMP.${aliasName} FOR ${library}.${file}(${member})`);
            console.log(`[MemberReplacer] created alias QTEMP.${aliasName} for ${library}.${file}(${member})`);

            const lineResults: OccurrenceResult[] = [];

            try {
                console.log(`[MemberReplacer] reading via runSQL`);
                let rows: any[];
                try {
                    rows = await content.runSQL(
                        `SELECT SRCSEQ, SRCDTA FROM QTEMP.${aliasName} ORDER BY SRCSEQ`
                    );
                } catch (e: any) {
                    console.error(`[MemberReplacer] runSQL read failed:`, e?.message);
                    return {
                        memberPath,
                        lineResults: Array.from(selectedLines).map(lineNumber => ({
                            memberPath, lineNumber, status: 'failed' as const,
                            error: e?.message || 'SQL read failed'
                        })),
                        error: e?.message || 'SQL read failed'
                    };
                }

                console.log(`[MemberReplacer] runSQL read: ${rows.length} lines`);

                for (const lineNumber of selectedLines) {
                    const idx = lineNumber - 1;
                    if (idx < 0 || idx >= rows.length) {
                        console.log(`[MemberReplacer] line ${lineNumber} out of range (member has ${rows.length} lines)`);
                        lineResults.push({ memberPath, lineNumber, status: 'not_found' });
                        continue;
                    }

                    const row = rows[idx];
                    const srcseq = row.SRCSEQ;
                    const original = String(row.SRCDTA ?? '').trimEnd();
                    console.log(`[MemberReplacer] line ${lineNumber} (SRCSEQ=${srcseq}): ${JSON.stringify(original)}`);

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

                    const escapedContent = replaced.replace(/'/g, "''");
                    try {
                        await content.runSQL(
                            `UPDATE QTEMP.${aliasName} SET SRCDTA = '${escapedContent}' WHERE SRCSEQ = ${srcseq}`
                        );
                        console.log(`[MemberReplacer] UPDATE succeeded for SRCSEQ=${srcseq}`);
                    } catch (e: any) {
                        console.error(`[MemberReplacer] UPDATE failed for SRCSEQ=${srcseq}:`, e?.message);
                        const isAuth = e?.message?.toLowerCase().includes('authority') ||
                                       e?.message?.toLowerCase().includes('permission');
                        lineResults.push({
                            memberPath, lineNumber,
                            status: isAuth ? 'authority_error' as const : 'failed' as const,
                            error: isAuth ? undefined : (e?.message || 'SQL update failed')
                        });
                        continue;
                    }

                    const status = replaced.trimEnd().length > 80
                        ? 'replaced_with_truncation_risk' as const
                        : 'replaced' as const;

                    lineResults.push({ memberPath, lineNumber, status });
                }
            } finally {
                await content.runSQL(`DROP ALIAS QTEMP.${aliasName}`).catch(() => {});
                console.log(`[MemberReplacer] dropped alias QTEMP.${aliasName}`);
            }

            console.log(`[MemberReplacer] done with ${memberPath}:`, lineResults.map(r => `line ${r.lineNumber}=${r.status}`));
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
                    memberPath, lineNumber, status: 'failed' as const,
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
