import * as vscode from 'vscode';
import { PFGREPOptions, SearchMode, LibraryItem } from '../types/interfaces';
import { ConnectionManager } from '../core/connectionManager';
import { SettingsManager } from '../core/settingsManager';
import { PFGREPResultsManager } from './resultsManager';
import { LibraryBrowser } from './libraryBrowser';

export class PFGREPSearchModal {
    private context: vscode.ExtensionContext;
    private settingsManager: SettingsManager;
    private resultsManager: PFGREPResultsManager;
    private libraryBrowser: LibraryBrowser;

    constructor(context: vscode.ExtensionContext, resultsManager: PFGREPResultsManager) {
        this.context = context;
        this.settingsManager = new SettingsManager(context);
        this.resultsManager = resultsManager;
        this.libraryBrowser = new LibraryBrowser(context);
    }

    /**
     * Show the search modal dialog
     */
    public async show(): Promise<void> {
        try {
            // Step 1: Get search mode
            const searchMode = await this.selectSearchMode();
            if (!searchMode) {
                return; // User cancelled
            }

            // Step 2: Get search term
            const searchTerm = await this.getSearchTerm();
            if (!searchTerm) {
                return; // User cancelled
            }

            // Step 3: Get libraries
            const libraries = await this.selectLibraries();
            if (!libraries || libraries.length === 0) {
                return; // User cancelled
            }

            // Step 4: Get search options
            const options = await this.getSearchOptions(searchMode, searchTerm, libraries);
            if (!options) {
                return; // User cancelled
            }

            // Step 5: Execute search
            await this.executeSearch(options);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Search failed: ${error.message}`);
        }
    }

    /**
     * Select search mode (Quick vs Advanced)
     */
    private async selectSearchMode(): Promise<SearchMode | undefined> {
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(zap) Quick Search',
                description: 'Simple search with sensible defaults',
                detail: 'Search term + libraries + essential options (case insensitive, recursive)',
                picked: true
            },
            {
                label: '$(settings-gear) Advanced Search',
                description: 'All PFGREP options available',
                detail: 'Full control over all PFGREP flags and parameters'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'PFGREP Search Mode',
            placeHolder: 'Select search mode',
            ignoreFocusOut: true
        });

        if (!selected) {
            return undefined;
        }

        return selected.label.includes('Quick') ? SearchMode.Quick : SearchMode.Advanced;
    }

    /**
     * Get search term from user
     */
    private async getSearchTerm(): Promise<string | undefined> {
        const recentTerms = this.settingsManager.getRecentSearchTerms();
        
        if (recentTerms.length > 0) {
            // Show recent terms first
            const items: vscode.QuickPickItem[] = [
                { label: '', kind: vscode.QuickPickItemKind.Separator },
                ...recentTerms.map(term => ({ label: term, description: 'Recent search' })),
                { label: '', kind: vscode.QuickPickItemKind.Separator },
                { label: '$(edit) Enter new search term', description: 'Type a new search term' }
            ];

            const quickPick = vscode.window.createQuickPick();
            quickPick.title = 'PFGREP Search Term';
            quickPick.placeholder = 'Enter search term or select from recent searches';
            quickPick.items = items;
            quickPick.ignoreFocusOut = true;

            return new Promise((resolve) => {
                quickPick.onDidChangeValue(() => {
                    if (quickPick.value && !recentTerms.includes(quickPick.value)) {
                        quickPick.items = [
                            { label: quickPick.value, description: 'New search term' },
                            { label: '', kind: vscode.QuickPickItemKind.Separator },
                            ...items
                        ];
                    }
                });

                quickPick.onDidAccept(() => {
                    const searchTerm = quickPick.activeItems[0]?.label || quickPick.value;
                    quickPick.hide();
                    
                    if (searchTerm === '$(edit) Enter new search term' || !searchTerm) {
                        // Show input box for new term
                        vscode.window.showInputBox({
                            title: 'Enter Search Term',
                            prompt: 'Enter the text to search for',
                            placeHolder: 'Search term...',
                            ignoreFocusOut: true
                        }).then(resolve);
                    } else {
                        resolve(searchTerm);
                    }
                });

                quickPick.onDidHide(() => {
                    quickPick.dispose();
                    resolve(undefined);
                });

                quickPick.show();
            });
        } else {
            // No recent terms, show input box directly
            return vscode.window.showInputBox({
                title: 'Enter Search Term',
                prompt: 'Enter the text to search for',
                placeHolder: 'Search term...',
                ignoreFocusOut: true
            });
        }
    }

    /**
     * Select libraries to search
     */
    private async selectLibraries(): Promise<string[] | undefined> {
        const libraries = await this.libraryBrowser.selectLibraries();
        
        if (libraries && libraries.length > 0) {
            // Update recent libraries
            await this.settingsManager.updateRecentLibraries(libraries);
        }
        
        return libraries;
    }

    /**
     * Get search options based on mode
     */
    private async getSearchOptions(
        mode: SearchMode,
        searchTerm: string,
        libraries: string[]
    ): Promise<PFGREPOptions | undefined> {
        const defaultOptions = this.settingsManager.getDefaultOptions();
        
        const baseOptions: PFGREPOptions = {
            searchTerm,
            libraries,
            caseInsensitive: defaultOptions.caseInsensitive ?? true,
            recursive: defaultOptions.recursive ?? true,
            wholeWords: defaultOptions.wholeWords ?? false,
            fixedString: defaultOptions.fixedString ?? false
        };

        if (mode === SearchMode.Quick) {
            return await this.getQuickSearchOptions(baseOptions);
        } else {
            return await this.getAdvancedSearchOptions(baseOptions);
        }
    }

    /**
     * Get quick search options
     */
    private async getQuickSearchOptions(baseOptions: PFGREPOptions): Promise<PFGREPOptions | undefined> {
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(case-sensitive) Case Insensitive',
                description: 'Search ignoring case differences',
                picked: baseOptions.caseInsensitive
            },
            {
                label: '$(symbol-string) Fixed String',
                description: 'Search for exact string (not regex)',
                picked: baseOptions.fixedString
            },
            {
                label: '$(whole-word) Whole Words',
                description: 'Match complete words only',
                picked: baseOptions.wholeWords
            },
            {
                label: '$(file-submodule) Recursive',
                description: 'Search recursively through libraries',
                picked: baseOptions.recursive
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Quick Search Options',
            placeHolder: 'Select search options',
            canPickMany: true,
            ignoreFocusOut: true
        });

        if (!selected) {
            return undefined;
        }

        return {
            ...baseOptions,
            caseInsensitive: selected.some(item => item.label.includes('Case Insensitive')),
            fixedString: selected.some(item => item.label.includes('Fixed String')),
            wholeWords: selected.some(item => item.label.includes('Whole Words')),
            recursive: selected.some(item => item.label.includes('Recursive'))
        };
    }

    /**
     * Get advanced search options
     */
    private async getAdvancedSearchOptions(baseOptions: PFGREPOptions): Promise<PFGREPOptions | undefined> {
        // First get basic options
        const quickOptions = await this.getQuickSearchOptions(baseOptions);
        if (!quickOptions) {
            return undefined;
        }

        // Then get advanced options
        const advancedItems: vscode.QuickPickItem[] = [
            {
                label: '$(list-ordered) Show Line Numbers',
                description: 'Include line numbers in results (-n)',
                picked: false
            },
            {
                label: '$(arrow-swap) Invert Matches',
                description: 'Show lines that do NOT match (-v)',
                picked: false
            },
            {
                label: '$(error) Silent Errors',
                description: 'Suppress error messages (-s)',
                picked: false
            },
            {
                label: '$(file-binary) Non-Source Files',
                description: 'Search non-source physical files (-p)',
                picked: false
            },
            {
                label: '$(preserve-case) Don\'t Trim Whitespace',
                description: 'Preserve line padding (-t)',
                picked: false
            }
        ];

        const advancedSelected = await vscode.window.showQuickPick(advancedItems, {
            title: 'Advanced Search Options',
            placeHolder: 'Select additional options (optional)',
            canPickMany: true,
            ignoreFocusOut: true
        });

        // Get numeric options
        let maxMatches: number | undefined;
        let afterContext: number | undefined;

        const showNumericOptions = await vscode.window.showQuickPick([
            { label: 'Yes', description: 'Set max matches and/or after context' },
            { label: 'No', description: 'Use default values' }
        ], {
            title: 'Configure Numeric Options?',
            placeHolder: 'Set maximum matches or after context lines?',
            ignoreFocusOut: true
        });

        if (showNumericOptions?.label === 'Yes') {
            const maxMatchesStr = await vscode.window.showInputBox({
                title: 'Maximum Matches',
                prompt: 'Maximum number of matches (leave empty for no limit)',
                placeHolder: 'e.g., 100',
                validateInput: (value) => {
                    if (value && isNaN(parseInt(value))) {
                        return 'Please enter a valid number';
                    }
                    return undefined;
                },
                ignoreFocusOut: true
            });

            if (maxMatchesStr && maxMatchesStr.trim()) {
                maxMatches = parseInt(maxMatchesStr);
            }

            const afterContextStr = await vscode.window.showInputBox({
                title: 'After Context Lines',
                prompt: 'Number of lines to show after each match',
                placeHolder: 'e.g., 3',
                validateInput: (value) => {
                    if (value && isNaN(parseInt(value))) {
                        return 'Please enter a valid number';
                    }
                    return undefined;
                },
                ignoreFocusOut: true
            });

            if (afterContextStr && afterContextStr.trim()) {
                afterContext = parseInt(afterContextStr);
            }
        }

        const finalOptions: PFGREPOptions = {
            ...quickOptions,
            showLineNumbers: advancedSelected?.some(item => item.label.includes('Line Numbers')) ?? false,
            invertMatch: advancedSelected?.some(item => item.label.includes('Invert')) ?? false,
            silentErrors: advancedSelected?.some(item => item.label.includes('Silent')) ?? false,
            nonSourceFiles: advancedSelected?.some(item => item.label.includes('Non-Source')) ?? false,
            dontTrimWhitespace: advancedSelected?.some(item => item.label.includes('Trim')) ?? false,
            maxMatches,
            afterContext
        };

        return finalOptions;
    }

    /**
     * Execute the search
     */
    private async executeSearch(options: PFGREPOptions): Promise<void> {
        // Update search history
        await this.settingsManager.updateSearchHistory(options.searchTerm);

        // Execute search through results manager
        await this.resultsManager.executeSearch(options);
    }
}