import * as vscode from 'vscode';
import { FastPfuriousOptions, SearchResults, SearchHit, IBMiConnection } from '../types/interfaces';
import { ConnectionManager } from './connectionManager';

export class FastPfuriousExecutor {
    private static activeSearches: Map<string, vscode.CancellationTokenSource> = new Map();

    /**
     * Execute a PFGREP search with the given options
     */
    public static async executeSearch(
        options: FastPfuriousOptions,
        searchId: string
    ): Promise<SearchResults> {
        const connection = ConnectionManager.getConnection();
        if (!connection) {
            throw new Error('No IBM i connection available');
        }

        // Create cancellation token for this search
        const cancellationToken = new vscode.CancellationTokenSource();
        this.activeSearches.set(searchId, cancellationToken);

        try {
            // Build PFGREP command
            const command = this.buildPFGREPCommand(options);

            // Show simple status (no progress bar per requirements)
            vscode.window.setStatusBarMessage('🔍 Fast & PF-urious Search running...');

            // Execute command
            const output = await this.executePFGREPCommand(
                command, 
                connection, 
                cancellationToken.token
            );

            // Parse results
            const results = this.parsePFGREPOutput(output, options, searchId);

            // Update status with results
            const totalHits = this.getTotalHits(results);
            vscode.window.setStatusBarMessage(
                `✅ Fast & PF-urious found ${results.hits.length} files with ${totalHits} hits`,
                3000
            );

            return results;

        } catch (error: any) {
            vscode.window.setStatusBarMessage(`❌ Fast & PF-urious failed: ${error.message}`, 5000);
            throw error;
        } finally {
            this.activeSearches.delete(searchId);
            cancellationToken.dispose();
        }
    }

    /**
     * Cancel an active search
     */
    public static cancelSearch(searchId: string): void {
        const cancellationToken = this.activeSearches.get(searchId);
        if (cancellationToken) {
            cancellationToken.cancel();
            this.activeSearches.delete(searchId);
        }
    }

    /**
     * Cancel all active searches
     */
    public static cancelAllSearches(): void {
        for (const [searchId, token] of this.activeSearches) {
            token.cancel();
        }
        this.activeSearches.clear();
    }

    /**
     * Build PFGREP command from options
     */
    private static buildPFGREPCommand(options: FastPfuriousOptions): string {
        const flags: string[] = [];

        // Case sensitivity (INVERTED LOGIC: caseSensitive OFF by default = case insensitive search)
        // Add -i flag when NOT case sensitive (i.e., when caseSensitive is false or undefined)
        if (!options.caseSensitive) {
            flags.push('-i');
        }

        // Search mode (INVERTED LOGIC: smartSearchRegex OFF by default = normal/fixed string search)
        // Add -F flag when NOT using regex (i.e., when smartSearchRegex is false or undefined)
        if (!options.smartSearchRegex) {
            flags.push('-F');
        }

        // Always enable recursive search
        flags.push('-r');

        // Always show line numbers (required for parsing)
        flags.push('-n');

        // Always show filename (required for parsing)
        flags.push('-H');

        // Hardcode max matches to 5000
        flags.push('-m 5000');

        // After context lines (optional, 0-50)
        // NOTE: PFGREP only supports -A (after), not -B (before)
        if (options.afterContext && options.afterContext > 0) {
            flags.push(`-A ${options.afterContext}`);
        }

        const flagString = flags.length > 0 ? flags.join(' ') + ' ' : '';

        // Escape search term for shell safety
        const escapedTerm = this.escapeShellArgument(options.searchTerm);

        // Build library paths - support wildcards and comma-separated lists
        const libraryPaths = this.buildLibraryPaths(options.libraries);

        // Get the full PFGREP path (discovered during validation)
        const pfgrepPath = ConnectionManager.getPFGREPPath();

        // Return complete command using full path
        return `${pfgrepPath} ${flagString}${escapedTerm} ${libraryPaths}`;
    }

    /**
     * Build library paths from library list
     * Supports formats like MYLIB, MYLIB/QRPGLESRC, MYLIB/QRPGLESRC/MYPGM with wildcards
     */
    private static buildLibraryPaths(libraries: string[]): string {
        const paths: string[] = [];

        for (const library of libraries) {
            // Check if this is a granular pattern (contains /)
            if (library.includes('/')) {
                const parts = library.split('/');

                if (parts.length === 2) {
                    // Library + File: MYLIB/QRPGLESRC or */QCLSRC
                    const lib = parts[0];
                    const file = parts[1];
                    paths.push(`/QSYS.LIB/${lib}.LIB/${file}.FILE`);
                } else if (parts.length === 3) {
                    // Library + File + Member: MYLIB/QRPGLESRC/PROG* or MYLIB/*/*
                    const lib = parts[0];
                    const file = parts[1];
                    const member = parts[2];

                    if (member === '*') {
                        // All members: MYLIB/QRPGLESRC/*
                        paths.push(`/QSYS.LIB/${lib}.LIB/${file}.FILE/*.MBR`);
                    } else {
                        // Specific member or wildcard: MYLIB/QRPGLESRC/MYPGM or MYLIB/QRPGLESRC/PROG*
                        paths.push(`/QSYS.LIB/${lib}.LIB/${file}.FILE/${member}.MBR`);
                    }
                }
            } else if (library === '*ALL' || library === 'ALL') {
                // Special case for all libraries - use generic search path
                paths.push('/QSYS.LIB/*.LIB');
            } else if (library.includes(',')) {
                // Handle comma-separated: "LIB1,LIB2,LIB3"
                const libs = library.split(',').map(l => l.trim().toUpperCase());
                libs.forEach(lib => {
                    paths.push(`/QSYS.LIB/${lib}.LIB`);
                });
            } else if (library.includes('*')) {
                // Handle wildcards: "PROD*", "AGO*"
                paths.push(`/QSYS.LIB/${library.toUpperCase()}.LIB`);
            } else {
                // Regular library name
                paths.push(`/QSYS.LIB/${library.toUpperCase()}.LIB`);
            }
        }

        return paths.join(' ');
    }

    /**
     * Escape shell arguments safely
     */
    private static escapeShellArgument(arg: string): string {
        // Simple shell escaping - wrap in single quotes and escape any single quotes
        return `'${arg.replace(/'/g, "'\"'\"'")}'`;
    }

    /**
     * Execute PFGREP command
     */
    private static async executePFGREPCommand(
        command: string,
        connection: IBMiConnection,
        cancellationToken?: vscode.CancellationToken
    ): Promise<string> {
        try {
            // Execute in PASE environment
            const result = await connection.sendCommand({
                command,
                environment: 'pase'
            });

            // Check for cancellation
            if (cancellationToken?.isCancellationRequested) {
                throw new Error('Search cancelled by user');
            }

            // PFGREP return codes:
            // 0 = matches found
            // 1 = no matches (not an error)
            // >1 = actual error
            if (result.code === 0 || result.code === 1) {
                return result.stdout || '';
            } else {
                // Parse specific PFGREP errors with exact messages per requirements
                if (result.stderr?.includes('Permission denied')) {
                    throw new Error("Don't have authority to that library");
                }
                if (result.stderr?.includes('No such file or directory')) {
                    throw new Error('Library does not exist or is not accessible');
                }
                throw new Error(result.stderr || 'PFGREP command failed');
            }

        } catch (error: any) {
            // Handle SSH/connection errors
            if (error.message?.includes('connection')) {
                throw new Error('Connection lost to IBM i system');
            }
            
            // Handle cancellation
            if (error.message?.includes('cancelled')) {
                throw new Error('Search cancelled by user');
            }
            
            throw error;
        }
    }

    /**
     * Parse PFGREP output into structured results
     */
    private static parsePFGREPOutput(
        output: string,
        options: FastPfuriousOptions,
        searchId: string
    ): SearchResults {
        const lines = output.split('\n').filter(line => line.trim());
        const hits: SearchHit[] = [];
        const hitMap = new Map<string, SearchHit>();
        let totalMatchLines = 0;

        for (const line of lines) {
            // Skip separator lines (--) between match groups
            if (line === '--' || line.trim() === '--') {
                continue;
            }

            // PFGREP output format for matches: /QSYS.LIB/LIBRARY.LIB/FILE.FILE/MEMBER.MBR:lineNumber:content
            const matchLine = line.match(/^([^:]+):(\d+):(.*)$/);

            // PFGREP output format for context lines: /QSYS.LIB/LIBRARY.LIB/FILE.FILE/MEMBER.MBR-lineNumber-content
            const contextLine = line.match(/^([^:]+)-(\d+)-(.*)$/);

            if (matchLine) {
                const [, path, lineNum, content] = matchLine;
                totalMatchLines++;

                let hit = hitMap.get(path);
                if (!hit) {
                    hit = {
                        path,
                        lines: [],
                        readonly: false,
                        label: this.extractMemberName(path)
                    };
                    hitMap.set(path, hit);
                    hits.push(hit);
                }

                hit.lines.push({
                    number: parseInt(lineNum),
                    content: content.trim(),
                    isContext: false
                });
            } else if (contextLine) {
                const [, path, lineNum, content] = contextLine;

                let hit = hitMap.get(path);
                if (!hit) {
                    // Context line without a preceding match - shouldn't happen, but handle gracefully
                    hit = {
                        path,
                        lines: [],
                        readonly: false,
                        label: this.extractMemberName(path)
                    };
                    hitMap.set(path, hit);
                    hits.push(hit);
                }

                hit.lines.push({
                    number: parseInt(lineNum),
                    content: content.trim(),
                    isContext: true
                });
            }
        }

        // Sort results by path for consistent display
        hits.sort((a, b) => a.path.localeCompare(b.path));

        // Check if we hit the 5000 match limit and show warning
        if (totalMatchLines >= 5000) {
            vscode.window.showWarningMessage(
                '⚠️ Showing 5000 matches. There may be more results. Try refining your search.',
                { modal: false }
            );
        }

        return {
            term: options.searchTerm,
            hits,
            searchOptions: options,
            timestamp: new Date(),
            searchId
        };
    }

    /**
     * Extract member name from QSYS path for display
     */
    private static extractMemberName(qsysPath: string): string {
        // Extract member name from /QSYS.LIB/LIBRARY.LIB/FILE.FILE/MEMBER.MBR
        const parts = qsysPath.split('/');
        if (parts.length >= 5) {
            const memberPart = parts[4]; // MEMBER.MBR
            return memberPart.replace(/\.MBR$/, ''); // Remove .MBR extension
        }
        return qsysPath;
    }

    /**
     * Get total hit count across all search results
     */
    private static getTotalHits(results: SearchResults): number {
        return results.hits.reduce((total, hit) => total + hit.lines.length, 0);
    }

    /**
     * Check if there are any active searches
     */
    public static hasActiveSearches(): boolean {
        return this.activeSearches.size > 0;
    }

    /**
     * Get list of active search IDs
     */
    public static getActiveSearchIds(): string[] {
        return Array.from(this.activeSearches.keys());
    }
}