import * as vscode from 'vscode';
import { PFGREPOptions, SearchResults, SearchHit, IBMiConnection } from '../types/interfaces';
import { ConnectionManager } from './connectionManager';

export class PFGREPExecutor {
    private static activeSearches: Map<string, vscode.CancellationTokenSource> = new Map();

    /**
     * Execute a PFGREP search with the given options
     */
    public static async executeSearch(
        options: PFGREPOptions,
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
            vscode.window.setStatusBarMessage('🔍 PFGREP Search running...');

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
                `✅ PFGREP found ${results.hits.length} files with ${totalHits} hits`,
                3000
            );

            return results;

        } catch (error: any) {
            vscode.window.setStatusBarMessage(`❌ PFGREP failed: ${error.message}`, 5000);
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
    private static buildPFGREPCommand(options: PFGREPOptions): string {
        const flags: string[] = [];

        // Main UI flags
        if (options.caseInsensitive) flags.push('-i');
        if (options.fixedString) flags.push('-F');
        if (options.wholeWords) flags.push('-w');
        if (options.recursive) flags.push('-r');

        // Advanced flags
        if (options.showLineNumbers) flags.push('-n');
        if (options.invertMatch) flags.push('-v');
        if (options.silentErrors) flags.push('-s');
        if (options.nonSourceFiles) flags.push('-p');
        if (options.dontTrimWhitespace) flags.push('-t');

        // Flags with values
        if (options.maxMatches && options.maxMatches > 0) {
            flags.push(`-m ${options.maxMatches}`);
        }
        if (options.afterContext && options.afterContext > 0) {
            flags.push(`-A ${options.afterContext}`);
        }

        // Always show filename and line numbers for parsing
        flags.push('-H'); // Always prepend filename

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
     */
    private static buildLibraryPaths(libraries: string[]): string {
        const paths: string[] = [];

        for (const library of libraries) {
            if (library === '*ALL' || library === 'ALL') {
                // Special case for all libraries - use generic search path
                paths.push('/QSYS.LIB/*.LIB');
            } else if (library.includes(',')) {
                // Handle comma-separated: "LIB1,LIB2,LIB3"
                const libs = library.split(',').map(l => l.trim().toUpperCase());
                libs.forEach(lib => {
                    paths.push(`/QSYS.LIB/${lib}.LIB`);
                });
            } else if (library.includes('*')) {
                // Handle wildcards: "PROD*", "*TEST"
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
        options: PFGREPOptions, 
        searchId: string
    ): SearchResults {
        const lines = output.split('\n').filter(line => line.trim());
        const hits: SearchHit[] = [];
        const hitMap = new Map<string, SearchHit>();

        for (const line of lines) {
            // PFGREP output format: /QSYS.LIB/LIBRARY.LIB/FILE.FILE/MEMBER.MBR:lineNumber:content
            const match = line.match(/^([^:]+):(\d+):(.*)$/);
            if (match) {
                const [, path, lineNum, content] = match;

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
                    content: content.trim()
                });
            }
        }

        // Sort results by path for consistent display
        hits.sort((a, b) => a.path.localeCompare(b.path));

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