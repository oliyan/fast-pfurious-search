import * as vscode from 'vscode';
import { FastPfuriousOptions, SearchResults, ResultTreeItem, SortOrder } from '../types/interfaces';
import { FastPfuriousExecutor } from '../core/fastPfuriousExecutor';
import { ConnectionManager } from '../core/connectionManager';
import { SettingsManager } from '../core/settingsManager';
import { FastPfuriousResultsTreeProvider } from './resultsTreeProvider';

export class FastPfuriousResultsManager implements vscode.Disposable {
    private context: vscode.ExtensionContext;
    private settingsManager: SettingsManager;
    private treeProvider: FastPfuriousResultsTreeProvider;
    private activeSearches: Map<string, vscode.CancellationTokenSource> = new Map();
    private searchResults: Map<string, SearchResults> = new Map();
    private activeResultsId: string | undefined;
    private resultsChangedEmitter = new vscode.EventEmitter<void>();

    public readonly onResultsChanged = this.resultsChangedEmitter.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.settingsManager = new SettingsManager(context);
        this.treeProvider = new FastPfuriousResultsTreeProvider(this.settingsManager);
    }

    /**
     * Get the tree data provider for results
     */
    public getTreeDataProvider(): FastPfuriousResultsTreeProvider {
        return this.treeProvider;
    }

    /**
     * Execute a Fast & PF-urious search
     */
    public async executeSearch(options: FastPfuriousOptions): Promise<void> {
        const searchId = this.generateSearchId();
        
        try {
            // Check if we're at max windows
            const maxWindows = this.settingsManager.getMaxResultWindows();
            if (this.searchResults.size >= maxWindows) {
                const proceed = await vscode.window.showWarningMessage(
                    `Maximum of ${maxWindows} result windows allowed. Clear existing results?`,
                    'Yes, clear oldest',
                    'Cancel'
                );
                
                if (proceed === 'Yes, clear oldest') {
                    this.clearOldestResults();
                } else {
                    return;
                }
            }

            // Show search starting status
            vscode.window.setStatusBarMessage('🔍 Starting Fast & PF-urious search...');

            // Execute search
            const results = await FastPfuriousExecutor.executeSearch(options, searchId);

            // Store results
            this.searchResults.set(searchId, results);
            this.activeResultsId = searchId;

            // Update tree view
            this.treeProvider.setResults(results);
            this.resultsChangedEmitter.fire();

            // Show success message
            const totalHits = this.getTotalHits(results);
            vscode.window.showInformationMessage(
                `Found ${totalHits} hits in ${results.hits.length} members`
            );

        } catch (error: any) {
            vscode.window.showErrorMessage(`Search failed: ${error.message}`);
        }
    }

    /**
     * Cancel active search
     */
    public cancelActiveSearch(): void {
        if (this.activeResultsId) {
            FastPfuriousExecutor.cancelSearch(this.activeResultsId);
            vscode.window.setStatusBarMessage('🛑 Search cancelled', 2000);
        }
    }

    /**
     * Cancel all active searches
     */
    public cancelAllSearches(): void {
        FastPfuriousExecutor.cancelAllSearches();
        this.activeSearches.clear();
        vscode.window.setStatusBarMessage('🛑 All searches cancelled', 2000);
    }

    /**
     * Export active results to text file
     */
    public async exportActiveResults(): Promise<void> {
        if (!this.activeResultsId) {
            vscode.window.showWarningMessage('No search results to export');
            return;
        }

        const results = this.searchResults.get(this.activeResultsId);
        if (!results) {
            vscode.window.showWarningMessage('No search results to export');
            return;
        }

        try {
            const content = this.formatResultsAsText(results);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const defaultFilename = `fast-pfurious-${results.term}-${timestamp}.txt`;

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(defaultFilename),
                filters: { 'Text files': ['txt'] },
                saveLabel: 'Export Results'
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
                vscode.window.showInformationMessage(`Results exported to ${uri.fsPath}`);
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`Export failed: ${error.message}`);
        }
    }

    /**
     * Clear all results
     */
    public clearAllResults(): void {
        this.searchResults.clear();
        this.activeResultsId = undefined;
        this.treeProvider.clearResults();
        this.resultsChangedEmitter.fire();
        vscode.window.setStatusBarMessage('🗑️ Results cleared', 2000);
    }

    /**
     * Clear oldest results to make room for new ones
     */
    private clearOldestResults(): void {
        if (this.searchResults.size === 0) return;

        // Find oldest result by timestamp
        let oldestId: string | undefined;
        let oldestTime: Date | undefined;

        for (const [id, results] of this.searchResults) {
            if (!oldestTime || results.timestamp < oldestTime) {
                oldestTime = results.timestamp;
                oldestId = id;
            }
        }

        if (oldestId) {
            this.searchResults.delete(oldestId);
            
            // If we cleared the active results, switch to newest
            if (this.activeResultsId === oldestId) {
                this.switchToNewestResults();
            }
        }
    }

    /**
     * Switch to newest results
     */
    private switchToNewestResults(): void {
        if (this.searchResults.size === 0) {
            this.activeResultsId = undefined;
            this.treeProvider.clearResults();
        } else {
            // Find newest result
            let newestId: string | undefined;
            let newestTime: Date | undefined;

            for (const [id, results] of this.searchResults) {
                if (!newestTime || results.timestamp > newestTime) {
                    newestTime = results.timestamp;
                    newestId = id;
                }
            }

            if (newestId) {
                this.activeResultsId = newestId;
                const results = this.searchResults.get(newestId);
                if (results) {
                    this.treeProvider.setResults(results);
                }
            }
        }

        this.resultsChangedEmitter.fire();
    }

    /**
     * Switch to specific results
     */
    public switchToResults(searchId: string): void {
        const results = this.searchResults.get(searchId);
        if (results) {
            this.activeResultsId = searchId;
            this.treeProvider.setResults(results);
            this.resultsChangedEmitter.fire();
        }
    }

    /**
     * Get list of all result sets
     */
    public getAllResults(): { id: string; results: SearchResults }[] {
        return Array.from(this.searchResults.entries()).map(([id, results]) => ({ id, results }));
    }

    /**
     * Get active results
     */
    public getActiveResults(): SearchResults | undefined {
        if (!this.activeResultsId) return undefined;
        return this.searchResults.get(this.activeResultsId);
    }

    /**
     * Check if there are any results
     */
    public hasResults(): boolean {
        return this.searchResults.size > 0;
    }

    /**
     * Get total hits across all results in a search
     */
    private getTotalHits(results: SearchResults): number {
        return results.hits.reduce((total, hit) => total + hit.lines.length, 0);
    }

    /**
     * Format results as text for export
     */
    private formatResultsAsText(results: SearchResults): string {
        let output = `Fast & PF-urious Search Results\n`;
        output += `Search Term: "${results.term}"\n`;
        output += `Libraries: ${results.searchOptions.libraries.join(', ')}\n`;
        output += `Options: `;
        
        const opts: string[] = [];
        if (results.searchOptions.caseInsensitive) opts.push('Case Insensitive');
        if (results.searchOptions.fixedString) opts.push('Fixed String');
        if (results.searchOptions.wholeWords) opts.push('Whole Words');
        if (results.searchOptions.recursive) opts.push('Recursive');
        if (results.searchOptions.showLineNumbers) opts.push('Line Numbers');
        if (results.searchOptions.invertMatch) opts.push('Invert Match');
        
        output += opts.join(', ') || 'None';
        output += `\n`;
        output += `Generated: ${results.timestamp.toISOString()}\n`;
        output += `Total Hits: ${this.getTotalHits(results)} in ${results.hits.length} members\n\n`;
        output += `${'='.repeat(50)}\n\n`;

        // Group results by library for better organization
        const libraryGroups = this.groupResultsByLibrary(results);

        for (const [library, hits] of libraryGroups) {
            output += `Library: ${library}\n`;
            output += `${'-'.repeat(20)}\n`;

            for (const hit of hits) {
                const pathParts = ConnectionManager.parseMemberPath(hit.path);
                output += `${pathParts.file}/${pathParts.member} (${hit.lines.length} hits)\n`;
                
                for (const line of hit.lines) {
                    output += `  Line ${line.number}: ${line.content}\n`;
                }
                output += '\n';
            }
            output += '\n';
        }

        return output;
    }

    /**
     * Group results by library
     */
    private groupResultsByLibrary(results: SearchResults): Map<string, typeof results.hits> {
        const groups = new Map<string, typeof results.hits>();

        for (const hit of results.hits) {
            try {
                const pathParts = ConnectionManager.parseMemberPath(hit.path);
                const library = pathParts.library;
                
                if (!groups.has(library)) {
                    groups.set(library, []);
                }
                groups.get(library)!.push(hit);
            } catch (error) {
                // If path parsing fails, group under 'Unknown'
                if (!groups.has('Unknown')) {
                    groups.set('Unknown', []);
                }
                groups.get('Unknown')!.push(hit);
            }
        }

        return groups;
    }

    /**
     * Generate unique search ID
     */
    private generateSearchId(): string {
        return `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.cancelAllSearches();
        this.resultsChangedEmitter.dispose();
    }
}