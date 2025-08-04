import * as vscode from 'vscode';
import { ConnectionManager } from '../core/connectionManager';
import { SettingsManager } from '../core/settingsManager';

export class LibraryBrowser {
    private context: vscode.ExtensionContext;
    private settingsManager: SettingsManager;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.settingsManager = new SettingsManager(context);
    }

    /**
     * Show library selection dialog with tree structure and multi-select
     */
    public async selectLibraries(): Promise<string[] | undefined> {
        try {
            // Get connection to fetch libraries
            const connection = ConnectionManager.getConnection();
            if (!connection) {
                throw new Error('No IBM i connection available');
            }

            // Show options: Recent, All Libraries, or Custom Pattern
            const selectionMode = await this.showSelectionModeOptions();
            if (!selectionMode) {
                return undefined;
            }

            switch (selectionMode) {
                case 'recent':
                    return await this.selectFromRecent();
                case 'browse':
                    return await this.browseAllLibraries();
                case 'pattern':
                    return await this.enterCustomPattern();
                case 'all':
                    return ['*ALL'];
                default:
                    return undefined;
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`Library selection failed: ${error.message}`);
            return undefined;
        }
    }

    /**
     * Show selection mode options
     */
    private async showSelectionModeOptions(): Promise<string | undefined> {
        const recentLibraries = this.settingsManager.getRecentLibraries();
        
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(library) All Libraries',
                description: 'Search in all accessible libraries',
                detail: 'Uses wildcard search across all libraries (*ALL)'
            }
        ];

        if (recentLibraries.length > 0) {
            items.push({
                label: '$(history) Recent Libraries',
                description: `Select from ${recentLibraries.length} recently used libraries`,
                detail: recentLibraries.slice(0, 5).join(', ') + (recentLibraries.length > 5 ? '...' : '')
            });
        }

        items.push(
            {
                label: '$(list-tree) Browse Libraries',
                description: 'Browse and select from all available libraries',
                detail: 'Shows tree view with multi-select checkboxes'
            },
            {
                label: '$(regex) Custom Pattern',
                description: 'Enter library pattern or comma-separated list',
                detail: 'Supports wildcards: PROD*, *TEST, LIB1,LIB2,LIB3'
            }
        );

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Library Selection',
            placeHolder: 'Choose how to select libraries',
            ignoreFocusOut: true
        });

        if (!selected) {
            return undefined;
        }

        if (selected.label.includes('All Libraries')) return 'all';
        if (selected.label.includes('Recent')) return 'recent';
        if (selected.label.includes('Browse')) return 'browse';
        if (selected.label.includes('Custom')) return 'pattern';
        
        return undefined;
    }

    /**
     * Select from recent libraries
     */
    private async selectFromRecent(): Promise<string[] | undefined> {
        const recentLibraries = this.settingsManager.getRecentLibraries();
        
        if (recentLibraries.length === 0) {
            vscode.window.showInformationMessage('No recent libraries found');
            return undefined;
        }

        const items: vscode.QuickPickItem[] = recentLibraries.map(lib => ({
            label: lib,
            description: 'Recent library',
            picked: false
        }));

        // Add select all option
        items.unshift({
            label: '$(check-all) Select All Recent',
            description: `Select all ${recentLibraries.length} recent libraries`
        });

        const selected = await vscode.window.showQuickPick(items, {
            title: 'Recent Libraries',
            placeHolder: 'Select libraries from recent searches',
            canPickMany: true,
            ignoreFocusOut: true
        });

        if (!selected || selected.length === 0) {
            return undefined;
        }

        // Check if "Select All" was chosen
        const selectAllChosen = selected.some(item => item.label.includes('Select All'));
        if (selectAllChosen) {
            return recentLibraries;
        }

        return selected.map(item => item.label);
    }

    /**
     * Browse all available libraries
     */
    private async browseAllLibraries(): Promise<string[] | undefined> {
        const connection = ConnectionManager.getConnection();
        if (!connection) {
            throw new Error('No connection available');
        }

        // Show progress while fetching libraries
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Fetching library list...',
            cancellable: true
        }, async (progress, token) => {
            try {
                const libraries = await ConnectionManager.getLibraryList(connection);
                
                if (token.isCancellationRequested) {
                    return undefined;
                }

                // Create items with search functionality
                const items: vscode.QuickPickItem[] = libraries.map(lib => ({
                    label: lib,
                    description: 'Library',
                    picked: false
                }));

                // Add convenient options at the top
                items.unshift(
                    {
                        label: '$(check-all) Select All Libraries',
                        description: `Select all ${libraries.length} libraries`
                    },
                    {
                        label: '$(library) Production Libraries',
                        description: 'Select libraries containing "PROD"'
                    },
                    {
                        label: '$(beaker) Development Libraries', 
                        description: 'Select libraries containing "DEV" or "TEST"'
                    },
                    { label: '', kind: vscode.QuickPickItemKind.Separator }
                );

                const quickPick = vscode.window.createQuickPick();
                quickPick.title = 'Browse Libraries';
                quickPick.placeholder = 'Search and select libraries (type to filter)';
                quickPick.items = items;
                quickPick.canSelectMany = true;
                quickPick.ignoreFocusOut = true;

                return new Promise<string[] | undefined>((resolve) => {
                    quickPick.onDidChangeValue(() => {
                        if (quickPick.value) {
                            // Filter libraries based on search
                            const filtered = libraries
                                .filter(lib => lib.toLowerCase().includes(quickPick.value.toLowerCase()))
                                .map(lib => ({ label: lib, description: 'Library', picked: false }));
                            
                            quickPick.items = [
                                ...items.slice(0, 4), // Keep the convenience options
                                ...filtered
                            ];
                        } else {
                            quickPick.items = items;
                        }
                    });

                    quickPick.onDidAccept(() => {
                        const selected = quickPick.selectedItems;
                        quickPick.hide();

                        if (selected.length === 0) {
                            resolve(undefined);
                            return;
                        }

                        // Handle special selections
                        const selectAll = selected.some(item => item.label.includes('Select All'));
                        const prodLibs = selected.some(item => item.label.includes('Production'));
                        const devLibs = selected.some(item => item.label.includes('Development'));

                        if (selectAll) {
                            resolve(libraries);
                        } else if (prodLibs && devLibs) {
                            const filtered = libraries.filter(lib => 
                                lib.includes('PROD') || lib.includes('DEV') || lib.includes('TEST')
                            );
                            resolve(filtered);
                        } else if (prodLibs) {
                            const filtered = libraries.filter(lib => lib.includes('PROD'));
                            resolve(filtered);
                        } else if (devLibs) {
                            const filtered = libraries.filter(lib => 
                                lib.includes('DEV') || lib.includes('TEST')
                            );
                            resolve(filtered);
                        } else {
                            // Regular selection
                            const selectedLibs = selected
                                .filter(item => !item.label.startsWith('$('))
                                .map(item => item.label);
                            resolve(selectedLibs);
                        }
                    });

                    quickPick.onDidHide(() => {
                        quickPick.dispose();
                        resolve(undefined);
                    });

                    quickPick.show();
                });

            } catch (error: any) {
                throw new Error(`Failed to fetch libraries: ${error.message}`);
            }
        });
    }

    /**
     * Enter custom pattern
     */
    private async enterCustomPattern(): Promise<string[] | undefined> {
        const examples = [
            'PROD* (all libraries starting with PROD)',
            '*TEST (all libraries ending with TEST)', 
            'LIB1,LIB2,LIB3 (specific libraries)',
            'PROD*,*DEV (multiple patterns)'
        ];

        const pattern = await vscode.window.showInputBox({
            title: 'Custom Library Pattern',
            prompt: 'Enter library names, patterns, or comma-separated list',
            placeHolder: 'e.g., PROD*, *TEST, LIB1,LIB2,LIB3',
            value: this.settingsManager.getRecentLibraries()[0] || '',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Please enter at least one library name or pattern';
                }
                return undefined;
            },
            ignoreFocusOut: true
        });

        if (!pattern) {
            return undefined;
        }

        // Parse the pattern
        const libraries = pattern
            .split(',')
            .map(lib => lib.trim().toUpperCase())
            .filter(lib => lib.length > 0);

        if (libraries.length === 0) {
            vscode.window.showErrorMessage('No valid library names found in pattern');
            return undefined;
        }

        // Show preview of what will be searched
        const preview = libraries.length > 5 
            ? libraries.slice(0, 5).join(', ') + ` and ${libraries.length - 5} more...`
            : libraries.join(', ');

        const confirm = await vscode.window.showQuickPick([
            { label: 'Yes', description: `Search in: ${preview}` },
            { label: 'No', description: 'Go back and modify the pattern' }
        ], {
            title: 'Confirm Library Pattern',
            placeHolder: `Search in ${libraries.length} libraries?`,
            ignoreFocusOut: true
        });

        if (confirm?.label === 'Yes') {
            return libraries;
        }

        return undefined;
    }

    /**
     * Validate library pattern
     */
    private validateLibraryPattern(pattern: string): boolean {
        // Basic validation for library names and patterns
        const parts = pattern.split(',');
        
        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed.length === 0) continue;
            
            // Check for valid characters (IBM i library name rules)
            if (!/^[A-Za-z0-9_*]+$/.test(trimmed)) {
                return false;
            }
            
            // Check length (max 10 chars for library names, excluding wildcards)
            const withoutWildcards = trimmed.replace(/\*/g, '');
            if (withoutWildcards.length > 10) {
                return false;
            }
        }
        
        return true;
    }
}