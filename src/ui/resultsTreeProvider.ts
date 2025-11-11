import * as vscode from 'vscode';
import { SearchResults, SearchHit, ResultTreeItem, SortOrder } from '../types/interfaces';
import { SettingsManager } from '../core/settingsManager';
import { ConnectionManager } from '../core/connectionManager';

export class FastPfuriousResultsTreeProvider implements vscode.TreeDataProvider<ResultTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ResultTreeItem | undefined | null | void> = new vscode.EventEmitter<ResultTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ResultTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private results: SearchResults | undefined;
    private settingsManager: SettingsManager;
    private sortOrder: SortOrder = SortOrder.Name;

    constructor(settingsManager: SettingsManager) {
        this.settingsManager = settingsManager;
        this.sortOrder = settingsManager.getSortOrder() as SortOrder;
    }

    /**
     * Set new search results
     */
    public setResults(results: SearchResults): void {
        this.results = results;
        this.refresh();
    }

    /**
     * Clear all results
     */
    public clearResults(): void {
        this.results = undefined;
        this.refresh();
    }

    /**
     * Refresh the tree view
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Update sort order
     */
    public setSortOrder(sortOrder: SortOrder): void {
        this.sortOrder = sortOrder;
        this.settingsManager.updateSortOrder(sortOrder);
        this.refresh();
    }

    /**
     * Get tree item
     */
    getTreeItem(element: ResultTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children for tree item
     */
    getChildren(element?: ResultTreeItem): Thenable<ResultTreeItem[]> {
        if (!this.results) {
            return Promise.resolve([]);
        }

        if (!element) {
            // Root level - return libraries
            return Promise.resolve(this.getLibraryItems());
        }

        switch (element.contextValue) {
            case 'library':
                return Promise.resolve(this.getFileItems(element.label as string));
            case 'file':
                // Fixed: Pass the actual library name stored in the element
                return Promise.resolve(this.getMemberItems(element.label as string, element.libraryName!));
            case 'member':
                return Promise.resolve(this.getLineItems(element.memberPath!));
            default:
                return Promise.resolve([]);
        }
    }

    /**
     * Get library items (top level)
     */
    private getLibraryItems(): ResultTreeItem[] {
        if (!this.results) return [];

        // Group hits by library
        const libraryGroups = new Map<string, SearchHit[]>();
        
        for (const hit of this.results.hits) {
            try {
                const pathParts = ConnectionManager.parseMemberPath(hit.path);
                const library = pathParts.library;
                
                if (!libraryGroups.has(library)) {
                    libraryGroups.set(library, []);
                }
                libraryGroups.get(library)!.push(hit);
            } catch (error) {
                console.error('Error parsing member path:', hit.path, error);
            }
        }

        // Create library items
        const items: ResultTreeItem[] = [];
        for (const [library, hits] of libraryGroups) {
            const hitCount = hits.reduce((total, hit) => total + hit.lines.length, 0);
            
            const item: ResultTreeItem = {
                label: library,
                description: `${hitCount} hits`,
                tooltip: `Library: ${library} (${hits.length} members, ${hitCount} hits)`,
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded, // Auto-expand libraries
                contextValue: 'library',
                iconPath: new vscode.ThemeIcon('library'),
                children: hits
            };
            
            items.push(item);
        }

        // Sort libraries
        return this.sortLibraryItems(items);
    }

    /**
     * Get file items for a library
     */
    private getFileItems(library: string): ResultTreeItem[] {
        if (!this.results) return [];

        // Filter hits for this library and group by file
        const fileGroups = new Map<string, SearchHit[]>();
        
        for (const hit of this.results.hits) {
            try {
                const pathParts = ConnectionManager.parseMemberPath(hit.path);
                if (pathParts.library === library) {
                    const file = pathParts.file;
                    
                    if (!fileGroups.has(file)) {
                        fileGroups.set(file, []);
                    }
                    fileGroups.get(file)!.push(hit);
                }
            } catch (error) {
                console.error('Error parsing member path:', hit.path, error);
            }
        }

        // Create file items
        const items: ResultTreeItem[] = [];
        for (const [file, hits] of fileGroups) {
            const hitCount = hits.reduce((total, hit) => total + hit.lines.length, 0);
            
            const item: ResultTreeItem = {
                label: file,
                description: `${hitCount} hits`,
                tooltip: `Source File: ${file} (${hits.length} members, ${hitCount} hits)`,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                contextValue: 'file',
                iconPath: new vscode.ThemeIcon('file-directory'),
                children: hits,
                libraryName: library // Store library name for getMemberItems
            };
            
            items.push(item);
        }

        return this.sortFileItems(items);
    }

    /**
     * Get member items for a file
     */
    private getMemberItems(file: string, library: string): ResultTreeItem[] {
        if (!this.results) return [];

        // Filter hits for this library/file
        const memberHits: SearchHit[] = [];
        
        for (const hit of this.results.hits) {
            try {
                const pathParts = ConnectionManager.parseMemberPath(hit.path);
                if (pathParts.library === library && pathParts.file === file) {
                    memberHits.push(hit);
                }
            } catch (error) {
                console.error('Error parsing member path:', hit.path, error);
            }
        }

        // Create member items
        const items: ResultTreeItem[] = memberHits.map(hit => {
            const pathParts = ConnectionManager.parseMemberPath(hit.path);
            
            const item: ResultTreeItem = {
                label: pathParts.member,
                description: `${hit.lines.length} hits`,
                tooltip: `Member: ${pathParts.member} (${hit.lines.length} hits)`,
                collapsibleState: hit.lines.length > 0 
                    ? vscode.TreeItemCollapsibleState.Collapsed 
                    : vscode.TreeItemCollapsibleState.None,
                contextValue: 'member',
                iconPath: new vscode.ThemeIcon('file-code'),
                memberPath: hit.path,
                searchHit: hit,
                command: {
                    command: 'fast-pfurious-search.openMemberAtLine',
                    title: 'Open Member',
                    arguments: [hit.path]
                }
            };
            
            return item;
        });

        return this.sortMemberItems(items);
    }

    /**
     * Get line items for a member
     */
    private getLineItems(memberPath: string): ResultTreeItem[] {
        if (!this.results) return [];

        const hit = this.results.hits.find(h => h.path === memberPath);
        if (!hit) return [];

        const items: ResultTreeItem[] = hit.lines.map(line => {
            // Different handling for context lines vs match lines
            const isContextLine = line.isContext === true;

            // Add visual prefix for context lines to make them more distinct
            const displayContent = isContextLine ? `  ${line.content}` : line.content;

            const item: ResultTreeItem = {
                label: isContextLine ? `Line ${line.number} (context)` : `Line ${line.number}`,
                description: displayContent,
                tooltip: isContextLine
                    ? `Context line ${line.number}: ${line.content}`
                    : `Match at line ${line.number}: ${line.content}`,
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                contextValue: isContextLine ? 'contextLine' : 'line',
                iconPath: isContextLine
                    ? new vscode.ThemeIcon('dash', new vscode.ThemeColor('disabledForeground'))  // Dash icon for context (more dimmed)
                    : new vscode.ThemeIcon('arrow-right', new vscode.ThemeColor('charts.green')),  // Arrow icon for matches (highlighted)
                lineNumber: line.number,
                memberPath: memberPath,
                command: {
                    command: 'fast-pfurious-search.openMemberAtLine',
                    title: 'Go to Line',
                    arguments: [memberPath, line.number]
                }
            };

            return item;
        });

        // Sort lines by line number
        return items.sort((a, b) => (a.lineNumber || 0) - (b.lineNumber || 0));
    }

    /**
     * Highlight search term in content (simple text highlighting)
     */
    private highlightSearchTerm(content: string, searchTerm: string): string {
        if (!searchTerm) return content;
        
        // Simple case-insensitive highlighting
        const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
        return content.replace(regex, '→ $1 ←');
    }

    /**
     * Escape regex special characters
     */
    private escapeRegex(text: string): string {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Sort library items based on current sort order
     */
    private sortLibraryItems(items: ResultTreeItem[]): ResultTreeItem[] {
        switch (this.sortOrder) {
            case SortOrder.Name:
                return items.sort((a, b) => (a.label as string).localeCompare(b.label as string));
            case SortOrder.Hits:
                return items.sort((a, b) => {
                    const hitsA = this.extractHitCount(a.description as string);
                    const hitsB = this.extractHitCount(b.description as string);
                    return hitsB - hitsA; // Descending order
                });
            case SortOrder.Library:
                return items.sort((a, b) => (a.label as string).localeCompare(b.label as string));
            default:
                return items;
        }
    }

    /**
     * Sort file items based on current sort order
     */
    private sortFileItems(items: ResultTreeItem[]): ResultTreeItem[] {
        switch (this.sortOrder) {
            case SortOrder.Name:
                return items.sort((a, b) => (a.label as string).localeCompare(b.label as string));
            case SortOrder.Hits:
                return items.sort((a, b) => {
                    const hitsA = this.extractHitCount(a.description as string);
                    const hitsB = this.extractHitCount(b.description as string);
                    return hitsB - hitsA;
                });
            default:
                return items;
        }
    }

    /**
     * Sort member items based on current sort order
     */
    private sortMemberItems(items: ResultTreeItem[]): ResultTreeItem[] {
        switch (this.sortOrder) {
            case SortOrder.Name:
            case SortOrder.Member:
                return items.sort((a, b) => (a.label as string).localeCompare(b.label as string));
            case SortOrder.Hits:
                return items.sort((a, b) => {
                    const hitsA = this.extractHitCount(a.description as string);
                    const hitsB = this.extractHitCount(b.description as string);
                    return hitsB - hitsA;
                });
            default:
                return items;
        }
    }

    /**
     * Extract hit count from description string
     */
    private extractHitCount(description: string): number {
        const match = description.match(/(\d+)\s+hits?/);
        return match ? parseInt(match[1]) : 0;
    }

    /**
     * Register command to open member at specific line
     */
    public static registerCommands(context: vscode.ExtensionContext): void {
        const openMemberAtLineCommand = vscode.commands.registerCommand(
            'fast-pfurious-search.openMemberAtLine',
            async (memberPath: string, lineNumber?: number) => {
                try {
                    await ConnectionManager.openMemberAtLine(memberPath, lineNumber);
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Failed to open member: ${error.message}`);
                }
            }
        );

        context.subscriptions.push(openMemberAtLineCommand);
    }
}