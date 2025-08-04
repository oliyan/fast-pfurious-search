import * as vscode from 'vscode';
import { PFGREPSearchModal } from './ui/searchModal';
import { PFGREPResultsManager } from './ui/resultsManager';
import { PFGREPResultsTreeProvider } from './ui/resultsTreeProvider';
import { ConnectionManager } from './core/connectionManager';
import { SettingsManager } from './core/settingsManager';

let resultsManager: PFGREPResultsManager;
let settingsManager: SettingsManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('PFGREP Search for IBM i is now active!');

    // Initialize managers
    resultsManager = new PFGREPResultsManager(context);
    settingsManager = new SettingsManager(context);

    // Register tree provider commands
    PFGREPResultsTreeProvider.registerCommands(context);

    // Register main search command
    const openSearchCommand = vscode.commands.registerCommand(
        'pfgrep-ibmi.openSearch', 
        async () => {
            try {
                // Validate environment
                await ConnectionManager.validateEnvironment();
                
                // Show search modal
                const searchModal = new PFGREPSearchModal(context, resultsManager);
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

    // Subscribe to disposal
    context.subscriptions.push(
        openSearchCommand,
        exportResultsCommand,
        clearResultsCommand,
        cancelSearchCommand,
        resultsTreeView,
        resultsManager
    );

    // Initialize settings on first activation
    settingsManager.initialize();
}

export function deactivate() {
    if (resultsManager) {
        resultsManager.dispose();
    }
}