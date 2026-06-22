import { ReplaceRequest, ReplaceResult, OccurrenceResult, IBMiConnection } from '../types/interfaces';

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

            // Log the first special (non-printable) character code to diagnose line endings
            for (let i = 0; i < Math.min(content.length, 1000); i++) {
                const code = content.charCodeAt(i);
                if (code < 32 || (code >= 127 && code <= 160)) {
                    console.log(`[MemberReplacer] first non-printable char at idx ${i}: 0x${code.toString(16)}`);
                    break;
                }
            }

            const lines = content.split('\n');
            console.log(`[MemberReplacer] total lines in member: ${lines.length}`);

            const lineResults: OccurrenceResult[] = [];
            let anyPatched = false;

            for (const lineNumber of selectedLines) {
                const idx = lineNumber - 1;
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
     * Read member content.
     * Uses Code for IBM i content API if available, otherwise QSH cat (which handles
     * EBCDIC→UTF-8 conversion properly, unlike PASE cat which returns raw fixed-width
     * records without newline delimiters).
     */
    private static async readMember(memberPath: string, connection: IBMiConnection): Promise<string | null> {
        const contentApi = connection.getContent();

        if (contentApi && typeof contentApi.downloadStreamFile === 'function') {
            try {
                console.log(`[MemberReplacer] reading via downloadStreamFile`);
                const data: string = await contentApi.downloadStreamFile(memberPath);
                if (data !== null && data !== undefined) {
                    console.log(`[MemberReplacer] downloadStreamFile returned ${data.length} chars`);
                    return data;
                }
            } catch (e: any) {
                console.log(`[MemberReplacer] downloadStreamFile failed: ${e?.message}`);
            }
        }

        // QSH environment handles EBCDIC→UTF-8 with proper \n line endings,
        // unlike PASE cat which returns raw records with no separator.
        console.log(`[MemberReplacer] reading via QSH cat`);
        const result = await connection.sendCommand({
            command: `cat "${memberPath}"`,
            environment: 'qsh'
        });
        console.log(`[MemberReplacer] QSH cat exit code: ${result.code}, stdout length: ${result.stdout?.length ?? 0}`);
        if (result.stderr) {
            console.log(`[MemberReplacer] QSH cat stderr: ${result.stderr}`);
        }

        if (result.code !== 0) {
            return null;
        }
        return result.stdout;
    }

    /**
     * Write member content.
     * Writes to a temp UTF-8 stream file, then uses CPYFRMSTMF to copy it back
     * to the SRCPF member with proper CCSID conversion (UTF-8 1208 → member CCSID).
     */
    private static async writeMember(memberPath: string, content: string, connection: IBMiConnection): Promise<boolean> {
        const contentApi = connection.getContent();

        if (contentApi && typeof contentApi.writeStreamFile === 'function') {
            try {
                console.log(`[MemberReplacer] writing via writeStreamFile`);
                await contentApi.writeStreamFile(memberPath, content);
                console.log(`[MemberReplacer] writeStreamFile succeeded`);
                return true;
            } catch (e: any) {
                console.log(`[MemberReplacer] writeStreamFile failed: ${e?.message}`);
            }
        }

        // Write UTF-8 to a temp stream file, then CPYFRMSTMF to member (handles CCSID)
        const tmpPath = `/tmp/fpfs_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`;
        const b64 = Buffer.from(content, 'utf8').toString('base64');

        console.log(`[MemberReplacer] writing temp stream file: ${tmpPath}`);
        const writeTemp = await connection.sendCommand({
            command: `printf '%s' "${b64}" | base64 -d > "${tmpPath}"`,
            environment: 'pase'
        });

        if (writeTemp.code !== 0) {
            console.log(`[MemberReplacer] failed to write temp file: ${writeTemp.stderr}`);
            return false;
        }

        // CPYFRMSTMF converts from UTF-8 stream file to native EBCDIC member
        console.log(`[MemberReplacer] running CPYFRMSTMF from ${tmpPath} to ${memberPath}`);
        const copyResult = await connection.sendCommand({
            command: `system "CPYFRMSTMF FROMSTMF('${tmpPath}') TOMBR('${memberPath}') MBROPT(*REPLACE) STMFCCSID(1208)"`,
            environment: 'pase'
        });
        console.log(`[MemberReplacer] CPYFRMSTMF exit code: ${copyResult.code}`);
        if (copyResult.stderr) {
            console.log(`[MemberReplacer] CPYFRMSTMF stderr: ${copyResult.stderr}`);
        }

        // Always clean up temp file
        await connection.sendCommand({ command: `rm -f "${tmpPath}"`, environment: 'pase' });

        if (copyResult.code !== 0) {
            console.log(`[MemberReplacer] CPYFRMSTMF failed`);
            return false;
        }

        return true;
    }

    private static replaceAllCaseInsensitive(str: string, search: string, replace: string): string {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return str.replace(new RegExp(escaped, 'gi'), replace);
    }
}
