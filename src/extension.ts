import * as vscode from 'vscode';
import { FastPfuriousSearchModal } from './ui/searchModal';
import { FastPfuriousResultsManager } from './ui/resultsManager';
import { FastPfuriousResultsTreeProvider } from './ui/resultsTreeProvider';
import { ConnectionManager } from './core/connectionManager';
import { SettingsManager } from './core/settingsManager';
import { ReplaceWindow } from './ui/replaceWindow';
import { MemberReplacer } from './core/memberReplacer';
import { ReplaceRequest, ReplaceResult } from './types/interfaces';

let resultsManager: FastPfuriousResultsManager;
let settingsManager: SettingsManager;
let searchModal: FastPfuriousSearchModal;
let replaceWindow: ReplaceWindow;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Fast & PF-urious Search is now active!');

    // Initialize managers
    resultsManager = new FastPfuriousResultsManager(context);
    settingsManager = new SettingsManager(context);

    // Replace callback: called when the user clicks Confirm Replace in the replace window
    const replaceCallback = async (request: ReplaceRequest): Promise<void> => {
        const connection = ConnectionManager.getConnection();
        if (!connection) {
            vscode.window.showErrorMessage('No IBM i connection available');
            return;
        }

        const summary = { replaced: 0, notFound: 0, failed: 0 };

        try {
            await MemberReplacer.executeReplace(request, connection, (result: ReplaceResult) => {
                replaceWindow.streamReplaceResult(result);
                for (const lr of result.lineResults) {
                    if (lr.status === 'replaced' || lr.status === 'replaced_with_truncation_risk') {
                        summary.replaced++;
                    } else if (lr.status === 'not_found') {
                        summary.notFound++;
                    } else {
                        summary.failed++;
                    }
                }
                if (result.error && result.lineResults.length === 0) {
                    summary.failed++;
                }
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Replace failed: ${error.message}`);
        }

        replaceWindow.replaceComplete(summary);
    };

    replaceWindow = new ReplaceWindow(context, replaceCallback);
    searchModal = new FastPfuriousSearchModal(context, resultsManager, replaceWindow);

    // Make context globally accessible for FastPfuriousExecutor
    (global as any).fastPfuriousContext = context;

    // Initialize settings and handle version migration
    await settingsManager.initialize();

    // Register tree provider commands
    FastPfuriousResultsTreeProvider.registerCommands(context);

    // Register search & replace command (triggered from search modal UI)
    const searchReplaceCommand = vscode.commands.registerCommand(
        'fast-pfurious-search.searchReplace',
        async () => {
            try {
                await ConnectionManager.validateEnvironment();
                await searchModal.show();
            } catch (error: any) {
                vscode.window.showErrorMessage(error.message);
            }
        }
    );

    // Register main search command
    const openSearchCommand = vscode.commands.registerCommand(
        'fast-pfurious-search.openSearch', 
        async () => {
            try {
                // Validate environment
                await ConnectionManager.validateEnvironment();
                
                // Show search modal (webview)
                await searchModal.show();
                
            } catch (error: any) {
                vscode.window.showErrorMessage(error.message);
            }
        }
    );

    // Register export results command
    const exportResultsCommand = vscode.commands.registerCommand(
        'fast-pfurious-search.exportResults',
        async () => {
            try {
                await resultsManager.exportActiveResults();
            } catch (error: any) {
                vscode.window.showErrorMessage(`Export failed: ${error.message}`);
            }
        }
    );

    // Register clear results command
    const clearResultsCommand = vscode.commands.registerCommand(
        'fast-pfurious-search.clearResults',
        async () => {
            resultsManager.clearAllResults();
            await vscode.commands.executeCommand('setContext', 'fast-pfurious-search:hasResults', false);
        }
    );

    // Register cancel search command
    const cancelSearchCommand = vscode.commands.registerCommand(
        'fast-pfurious-search.cancelSearch',
        async () => {
            resultsManager.cancelActiveSearch();
        }
    );

    // Register tree data provider for results
    const resultsTreeProvider = resultsManager.getTreeDataProvider();
    const resultsTreeView = vscode.window.createTreeView('fastPfuriousResults', {
        treeDataProvider: resultsTreeProvider,
        showCollapseAll: true,
        canSelectMany: false
    });

    // Set up context for when results are available
    resultsManager.onResultsChanged(() => {
        const hasResults = resultsManager.hasResults();
        vscode.commands.executeCommand('setContext', 'fast-pfurious-search:hasResults', hasResults);
    });

    const debugCommandsCommand = vscode.commands.registerCommand(
        'fast-pfurious-search.showIBMiCommands',
        async () => {
            try {
                const commands = await vscode.commands.getCommands();
                const ibmiCommands = commands.filter(cmd => cmd.includes('code-for-ibmi'));
                
                console.log('=== Available Code for IBM i Commands ===');
                ibmiCommands.forEach((cmd, index) => {
                    console.log(`${index + 1}. ${cmd}`);
                });
                
                // Show in VS Code UI
                const message = `Found ${ibmiCommands.length} Code for IBM i commands. Check the Output/Console for full list.`;
                vscode.window.showInformationMessage(message);
                
                // Also show first few in a quick pick
                const items = ibmiCommands.slice(0, 10).map(cmd => ({ 
                    label: cmd,
                    description: 'Click to copy command name'
                }));
                
                const selected = await vscode.window.showQuickPick(items, {
                    title: `Code for IBM i Commands (showing first 10 of ${ibmiCommands.length})`,
                    placeHolder: 'Select a command'
                });
                
                if (selected) {
                    await vscode.env.clipboard.writeText(selected.label);
                    vscode.window.showInformationMessage(`Copied: ${selected.label}`);
                }
                
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to get commands: ${error.message}`);
            }
        }
    );

    // Subscribe to disposal
    context.subscriptions.push(
        searchReplaceCommand,
        openSearchCommand,
        exportResultsCommand,
        clearResultsCommand,
        cancelSearchCommand,
        debugCommandsCommand,
        resultsTreeView,
        resultsManager
    );

    // Show welcome message on first use
    const hasShownWelcome = context.globalState.get('fast-pfurious-search.hasShownWelcome', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'Fast & PF-urious Search is ready! Press Ctrl+Alt+F to start searching.',
            'Got it!'
        ).then(() => {
            context.globalState.update('fast-pfurious-search.hasShownWelcome', true);
        });
    }
}

export function deactivate() {
    if (resultsManager) {
        resultsManager.dispose();
    }
}