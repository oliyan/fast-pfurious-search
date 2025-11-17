import * as vscode from 'vscode';
import { FastPfuriousOptions, SearchResults, SearchHit, IBMiConnection } from '../types/interfaces';
import { ConnectionManager } from './connectionManager';

/**
 * Interface for pattern-specific search errors
 */
interface PatternError {
    pattern: string;
    error: string;
}

/**
 * Interface for tracking individual pattern search cancellation tokens
 */
interface PatternSearch {
    pattern: string;
    cancellationToken: vscode.CancellationTokenSource;
}

/**
 * Type for progress callback function
 */
type ProgressCallback = (completed: number, total: number, results: SearchResults) => void;

export class FastPfuriousExecutor {
    private static activeSearches: Map<string, PatternSearch[]> = new Map();

    /**
     * Split library patterns from comma-separated string
     * Trims whitespace and filters empty patterns
     */
    private static splitPatterns(libraries: string[]): string[] {
        const patterns: string[] = [];

        for (const lib of libraries) {
            // Split by comma, trim, and filter empty strings
            const parts = lib.split(',')
                .map(p => p.trim())
                .filter(p => p.length > 0);
            patterns.push(...parts);
        }

        return patterns;
    }

    /**
     * Execute a PFGREP search with the given options
     * Now supports parallel execution of multiple patterns
     */
    public static async executeSearch(
        options: FastPfuriousOptions,
        searchId: string,
        progressCallback?: ProgressCallback
    ): Promise<SearchResults> {
        const connection = ConnectionManager.getConnection();
        if (!connection) {
            throw new Error('No IBM i connection available');
        }

        // Split library patterns by comma
        const patterns = this.splitPatterns(options.libraries);

        if (patterns.length === 0) {
            throw new Error('No valid library patterns provided');
        }

        // Get max parallel searches from settings
        const { SettingsManager } = await import('./settingsManager');
        const context = (global as any).fastPfuriousContext;
        const settingsManager = new SettingsManager(context);
        const maxParallel = settingsManager.getMaxParallelSearches();

        // Initialize tracking for this search
        this.activeSearches.set(searchId, []);
        const errors: PatternError[] = [];
        const allHits: SearchHit[] = [];
        let completedCount = 0;
        let cancelled = false;

        try {
            // Process patterns in batches
            for (let i = 0; i < patterns.length; i += maxParallel) {
                // Check if search was cancelled
                if (cancelled) {
                    break;
                }

                const batch = patterns.slice(i, Math.min(i + maxParallel, patterns.length));

                // Execute batch in parallel
                const batchResults = await Promise.allSettled(
                    batch.map(pattern => this.executePatternSearch(pattern, options, searchId, connection))
                );

                // Process results from this batch
                for (let j = 0; j < batchResults.length; j++) {
                    const result = batchResults[j];
                    const pattern = batch[j];

                    if (result.status === 'fulfilled') {
                        // Add hits from this pattern to overall results
                        allHits.push(...result.value);
                    } else {
                        // Collect error for this pattern
                        errors.push({
                            pattern,
                            error: result.reason?.message || 'Unknown error'
                        });
                    }

                    // Update progress
                    completedCount++;

                    // Call progress callback if provided
                    if (progressCallback) {
                        const intermediateResults: SearchResults = {
                            term: options.searchTerm,
                            hits: allHits,
                            searchOptions: options,
                            timestamp: new Date(),
                            searchId
                        };
                        progressCallback(completedCount, patterns.length, intermediateResults);
                    }
                }
            }

            // Show aggregated errors if any
            if (errors.length > 0 && !cancelled) {
                this.showAggregatedErrors(errors);
            }

            // Build final results
            const results: SearchResults = {
                term: options.searchTerm,
                hits: allHits,
                searchOptions: options,
                timestamp: new Date(),
                searchId
            };

            return results;

        } catch (error: any) {
            throw error;
        } finally {
            // Clean up all pattern searches
            const patternSearches = this.activeSearches.get(searchId);
            if (patternSearches) {
                patternSearches.forEach(ps => ps.cancellationToken.dispose());
            }
            this.activeSearches.delete(searchId);
        }
    }

    /**
     * Execute search for a single pattern
     */
    private static async executePatternSearch(
        pattern: string,
        options: FastPfuriousOptions,
        searchId: string,
        connection: IBMiConnection
    ): Promise<SearchHit[]> {
        // Create cancellation token for this pattern
        const cancellationToken = new vscode.CancellationTokenSource();

        // Track this pattern search
        const patternSearches = this.activeSearches.get(searchId) || [];
        patternSearches.push({ pattern, cancellationToken });
        this.activeSearches.set(searchId, patternSearches);

        try {
            // Build PFGREP command for this single pattern
            const command = this.buildPFGREPCommandForPattern(pattern, options);

            // Execute command
            const output = await this.executePFGREPCommand(
                command,
                connection,
                cancellationToken.token
            );

            // Parse output into hits
            const hits = this.parsePFGREPOutputToHits(output);

            return hits;

        } catch (error: any) {
            // Re-throw with pattern context
            const enhancedError = new Error(`Pattern "${pattern}": ${error.message}`);
            throw enhancedError;
        }
    }

    /**
     * Show aggregated error notification
     */
    private static showAggregatedErrors(errors: PatternError[]): void {
        if (errors.length === 1) {
            vscode.window.showErrorMessage(
                `Search failed for pattern "${errors[0].pattern}": ${errors[0].error}`
            );
        } else {
            const errorSummary = errors.map(e => `"${e.pattern}"`).join(', ');
            const detailedErrors = errors.map(e => `  • ${e.pattern}: ${e.error}`).join('\n');

            vscode.window.showErrorMessage(
                `${errors.length} pattern(s) failed: ${errorSummary}`,
                'Show Details'
            ).then(selection => {
                if (selection === 'Show Details') {
                    vscode.window.showInformationMessage(
                        `Failed patterns:\n${detailedErrors}`,
                        { modal: true }
                    );
                }
            });
        }
    }

    /**
     * Cancel an active search
     */
    public static cancelSearch(searchId: string): void {
        const patternSearches = this.activeSearches.get(searchId);
        if (patternSearches) {
            // Cancel all pattern searches for this search ID
            patternSearches.forEach(ps => {
                ps.cancellationToken.cancel();
                ps.cancellationToken.dispose();
            });
            this.activeSearches.delete(searchId);
        }
    }

    /**
     * Cancel all active searches
     */
    public static cancelAllSearches(): void {
        for (const [searchId, patternSearches] of this.activeSearches) {
            patternSearches.forEach(ps => {
                ps.cancellationToken.cancel();
                ps.cancellationToken.dispose();
            });
        }
        this.activeSearches.clear();
    }

    /**
     * Build PFGREP command for a single pattern
     */
    private static buildPFGREPCommandForPattern(pattern: string, options: FastPfuriousOptions): string {
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

        // Build library path for single pattern
        const libraryPath = this.buildLibraryPath(pattern);

        // Get the full PFGREP path (discovered during validation)
        const pfgrepPath = ConnectionManager.getPFGREPPath();

        // Return complete command using full path
        return `${pfgrepPath} ${flagString}${escapedTerm} ${libraryPath}`;
    }

    /**
     * Build library path for a single pattern
     * Supports formats like MYLIB, MYLIB/QRPGLESRC, MYLIB/QRPGLESRC/MYPGM with wildcards
     */
    private static buildLibraryPath(pattern: string): string {
        // Check if this is a granular pattern (contains /)
        if (pattern.includes('/')) {
            const parts = pattern.split('/');

            if (parts.length === 2) {
                // Library + File: MYLIB/QRPGLESRC or */QCLSRC
                const lib = parts[0];
                const file = parts[1];
                return `/QSYS.LIB/${lib}.LIB/${file}.FILE`;
            } else if (parts.length === 3) {
                // Library + File + Member: MYLIB/QRPGLESRC/PROG* or MYLIB/*/*
                const lib = parts[0];
                const file = parts[1];
                const member = parts[2];

                if (member === '*') {
                    // All members: MYLIB/QRPGLESRC/*
                    return `/QSYS.LIB/${lib}.LIB/${file}.FILE/*.MBR`;
                } else {
                    // Specific member or wildcard: MYLIB/QRPGLESRC/MYPGM or MYLIB/QRPGLESRC/PROG*
                    return `/QSYS.LIB/${lib}.LIB/${file}.FILE/${member}.MBR`;
                }
            }
        } else if (pattern === '*ALL' || pattern === 'ALL') {
            // Special case for all libraries - use generic search path
            return '/QSYS.LIB/*.LIB';
        } else if (pattern.includes('*')) {
            // Handle wildcards: "PROD*", "AGO*"
            return `/QSYS.LIB/${pattern.toUpperCase()}.LIB`;
        } else {
            // Regular library name
            return `/QSYS.LIB/${pattern.toUpperCase()}.LIB`;
        }

        // Fallback for unexpected formats
        return `/QSYS.LIB/${pattern.toUpperCase()}.LIB`;
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
     * Parse PFGREP output into array of SearchHit objects
     */
    private static parsePFGREPOutputToHits(output: string): SearchHit[] {
        const lines = output.split('\n').filter(line => line.trim());
        const hits: SearchHit[] = [];
        const hitMap = new Map<string, SearchHit>();

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

        return hits;
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