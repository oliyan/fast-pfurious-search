import * as vscode from 'vscode';
import { PFGREPSearchModal } from './ui/searchModal';
import { PFGREPResultsManager } from './ui/resultsManager';
import { PFGREPResultsTreeProvider } from './ui/resultsTreeProvider';
import { ConnectionManager } from './core/connectionManager';
import { SettingsManager } from './core/settingsManager';

let resultsManager: PFGREPResultsManager;
let settingsManager: SettingsManager;
let searchModal: PFGREPSearchModal;

export function activate(context: vscode.ExtensionContext) {
    console.log('PFGREP Search for IBM i is now active!');

    // Initialize managers
    resultsManager = new PFGREPResultsManager(context);
    settingsManager = new SettingsManager(context);
    searchModal = new PFGREPSearchModal(context, resultsManager);

    // Register tree provider commands
    PFGREPResultsTreeProvider.registerCommands(context);

    // Register main search command
    const openSearchCommand = vscode.commands.registerCommand(
        'pfgrep-ibmi.openSearch', 
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
        'pfgrep-ibmi.exportResults',
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
        'pfgrep-ibmi.clearResults',
        async () => {
            resultsManager.clearAllResults();
            await vscode.commands.executeCommand('setContext', 'pfgrep-ibmi:hasResults', false);
        }
    );

    // Register cancel search command
    const cancelSearchCommand = vscode.commands.registerCommand(
        'pfgrep-ibmi.cancelSearch',
        async () => {
            resultsManager.cancelActiveSearch();
        }
    );

    // Register tree data provider for results
    const resultsTreeProvider = resultsManager.getTreeDataProvider();
    const resultsTreeView = vscode.window.createTreeView('pfgrepResults', {
        treeDataProvider: resultsTreeProvider,
        showCollapseAll: true,
        canSelectMany: false
    });

    // Set up context for when results are available
    resultsManager.onResultsChanged(() => {
        const hasResults = resultsManager.hasResults();
        vscode.commands.executeCommand('setContext', 'pfgrep-ibmi:hasResults', hasResults);
    });

    const debugCommandsCommand = vscode.commands.registerCommand(
        'pfgrep-ibmi.showIBMiCommands',
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
        openSearchCommand,
        exportResultsCommand,
        clearResultsCommand,
        cancelSearchCommand,
        debugCommandsCommand,
        resultsTreeView,
        resultsManager
    );

    // Initialize settings on first activation
    settingsManager.initialize();

    // Show welcome message on first use
    const hasShownWelcome = context.globalState.get('pfgrep.hasShownWelcome', false);
    if (!hasShownWelcome) {
        vscode.window.showInformationMessage(
            'PFGREP Search for IBM i is ready! Press Ctrl+Alt+F to start searching.',
            'Got it!'
        ).then(() => {
            context.globalState.update('pfgrep.hasShownWelcome', true);
        });
    }
}

export function deactivate() {
    if (resultsManager) {
        resultsManager.dispose();
    }
}



// Don't forget to add it to context.subscriptions.push(debugMemberOpenCommand);