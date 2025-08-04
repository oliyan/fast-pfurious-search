import * as vscode from 'vscode';
import { PFGREPOptions } from '../types/interfaces';
import { SettingsManager } from '../core/settingsManager';
import { PFGREPResultsManager } from './resultsManager';

export class PFGREPSearchModal {
    private context: vscode.ExtensionContext;
    private settingsManager: SettingsManager;
    private resultsManager: PFGREPResultsManager;
    private panel: vscode.WebviewPanel | undefined;

    constructor(context: vscode.ExtensionContext, resultsManager: PFGREPResultsManager) {
        this.context = context;
        this.settingsManager = new SettingsManager(context);
        this.resultsManager = resultsManager;
    }

    /**
     * Show the search modal dialog
     */
    public async show(): Promise<void> {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'pfgrepSearch',
            'PFGREP Search',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: []
            }
        );

        this.panel.webview.html = this.getWebviewContent();
        
        // Handle dispose
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'search':
                        await this.executeSearch(message.options);
                        break;
                    case 'getDefaults':
                        await this.sendDefaults();
                        break;
                }
            }
        );

        // Send initial defaults
        setTimeout(() => this.sendDefaults(), 100);
    }

    /**
     * Send default values to webview
     */
    private async sendDefaults(): Promise<void> {
        if (!this.panel) return;

        const defaultLibraries = this.settingsManager.getDefaultLibraries();
        const lastUsedLibraries = this.settingsManager.getLastUsedLibraries();
        const recentSearchTerms = this.settingsManager.getRecentSearchTerms();
        const defaultOptions = this.settingsManager.getDefaultOptions();

        this.panel.webview.postMessage({
            command: 'setDefaults',
            data: {
                libraries: lastUsedLibraries || defaultLibraries || '',
                searchTerm: recentSearchTerms[0] || '',
                recentSearchTerms: recentSearchTerms.slice(0, 5),
                options: {
                    caseInsensitive: defaultOptions.caseInsensitive ?? true,
                    fixedString: defaultOptions.fixedString ?? false,
                    wholeWords: defaultOptions.wholeWords ?? false,
                    recursive: defaultOptions.recursive ?? true,
                    showLineNumbers: defaultOptions.showLineNumbers ?? false,
                    invertMatch: defaultOptions.invertMatch ?? false,
                    silentErrors: defaultOptions.silentErrors ?? false,
                    nonSourceFiles: defaultOptions.nonSourceFiles ?? false,
                    dontTrimWhitespace: defaultOptions.dontTrimWhitespace ?? false
                }
            }
        });
    }

    /**
     * Execute search with given options
     */
    private async executeSearch(formData: any): Promise<void> {
        try {
            // Parse libraries
            const libraries = formData.libraries
                .split(',')
                .map((lib: string) => lib.trim().toUpperCase())
                .filter((lib: string) => lib.length > 0);

            if (libraries.length === 0) {
                this.showWebviewError('Please enter at least one library name');
                return;
            }

            if (!formData.searchTerm || formData.searchTerm.trim().length === 0) {
                this.showWebviewError('Please enter a search term');
                return;
            }

            // Build search options
            const options: PFGREPOptions = {
                searchTerm: formData.searchTerm.trim(),
                libraries,
                caseInsensitive: formData.caseInsensitive,
                fixedString: formData.fixedString,
                wholeWords: formData.wholeWords,
                recursive: formData.recursive,
                showLineNumbers: formData.showLineNumbers,
                invertMatch: formData.invertMatch,
                silentErrors: formData.silentErrors,
                nonSourceFiles: formData.nonSourceFiles,
                dontTrimWhitespace: formData.dontTrimWhitespace,
                maxMatches: formData.maxMatches && formData.maxMatches > 0 ? parseInt(formData.maxMatches) : undefined,
                afterContext: formData.afterContext && formData.afterContext > 0 ? parseInt(formData.afterContext) : undefined
            };

            // Update last used libraries and search history
            await this.settingsManager.updateLastUsedLibraries(formData.libraries);
            await this.settingsManager.updateSearchHistory(formData.searchTerm);

            // Show searching status in webview
            this.showWebviewStatus('Searching...', 'info');

            // Execute search
            await this.resultsManager.executeSearch(options);

            // Show success status
            this.showWebviewStatus('Search completed!', 'success');

        } catch (error: any) {
            this.showWebviewError(`Search failed: ${error.message}`);
        }
    }

    /**
     * Show error message in webview
     */
    private showWebviewError(message: string): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'showMessage',
                type: 'error',
                message
            });
        }
    }

    /**
     * Show status message in webview
     */
    private showWebviewStatus(message: string, type: 'info' | 'success' | 'error'): void {
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'showMessage',
                type,
                message
            });
        }
    }

    /**
     * Get webview HTML content
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PFGREP Search</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        
        .container {
            max-width: 560px;
            margin: 0 auto;
        }
        
        .form-group {
            margin-bottom: 16px;
        }
        
        label {
            display: block;
            margin-bottom: 4px;
            font-weight: 600;
            color: var(--vscode-input-foreground);
        }
        
        input[type="text"], input[type="number"], textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            box-sizing: border-box;
            font-family: inherit;
            font-size: inherit;
        }
        
        input[type="text"]:focus, input[type="number"]:focus, textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        .recent-terms {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
        }
        
        .recent-term {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 12px;
        }
        
        .recent-term:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        
        .checkbox-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-top: 8px;
        }
        
        .checkbox-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        input[type="checkbox"] {
            margin: 0;
        }
        
        .advanced-section {
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 16px;
            margin-top: 16px;
        }
        
        .number-inputs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }
        
        .search-button {
            width: 100%;
            padding: 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            margin-top: 20px;
        }
        
        .search-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .search-button:disabled {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            cursor: not-allowed;
        }
        
        .status-message {
            padding: 8px 12px;
            border-radius: 3px;
            margin-top: 12px;
            font-weight: 500;
        }
        
        .status-error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-errorForeground);
        }
        
        .status-success {
            background-color: var(--vscode-terminal-ansiGreen);
            color: var(--vscode-terminal-background);
        }
        
        .status-info {
            background-color: var(--vscode-terminal-ansiBlue);
            color: var(--vscode-terminal-background);
        }
        
        .placeholder-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>PFGREP Search</h2>
        
        <form id="searchForm">
            <div class="form-group">
                <label for="searchTerm">Search Term:</label>
                <input type="text" id="searchTerm" name="searchTerm" placeholder="Enter text to search for..." required>
                <div class="recent-terms" id="recentTerms"></div>
            </div>
            
            <div class="form-group">
                <label for="libraries">Libraries:</label>
                <input type="text" id="libraries" name="libraries" placeholder="LIB1,LIB2,PROD*,*DEV" required>
                <div class="placeholder-text">Comma-separated library names or patterns (wildcards supported)</div>
            </div>
            
            <div class="form-group">
                <label>Search Options:</label>
                <div class="checkbox-grid">
                    <div class="checkbox-item">
                        <input type="checkbox" id="caseInsensitive" name="caseInsensitive" checked>
                        <label for="caseInsensitive">Case Insensitive</label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="fixedString" name="fixedString">
                        <label for="fixedString">Fixed String (not regex)</label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="wholeWords" name="wholeWords">
                        <label for="wholeWords">Whole Words</label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="recursive" name="recursive" checked>
                        <label for="recursive">Recursive</label>
                    </div>
                </div>
            </div>
            
            <div class="advanced-section">
                <label>Advanced Options:</label>
                <div class="checkbox-grid">
                    <div class="checkbox-item">
                        <input type="checkbox" id="showLineNumbers" name="showLineNumbers">
                        <label for="showLineNumbers">Show Line Numbers</label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="invertMatch" name="invertMatch">
                        <label for="invertMatch">Invert Matches</label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="silentErrors" name="silentErrors">
                        <label for="silentErrors">Silent Errors</label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="nonSourceFiles" name="nonSourceFiles">
                        <label for="nonSourceFiles">Non-Source Files</label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="dontTrimWhitespace" name="dontTrimWhitespace">
                        <label for="dontTrimWhitespace">Don't Trim Whitespace</label>
                    </div>
                </div>
                
                <div class="number-inputs" style="margin-top: 16px;">
                    <div class="form-group">
                        <label for="maxMatches">Max Matches:</label>
                        <input type="number" id="maxMatches" name="maxMatches" min="1" max="10000" placeholder="No limit">
                    </div>
                    <div class="form-group">
                        <label for="afterContext">After Context Lines:</label>
                        <input type="number" id="afterContext" name="afterContext" min="0" max="50" placeholder="0">
                    </div>
                </div>
            </div>
            
            <button type="submit" class="search-button" id="searchButton">Search</button>
            
            <div id="statusMessage" class="status-message" style="display: none;"></div>
        </form>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Handle form submission
        document.getElementById('searchForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const options = {};
            
            // Get all form values
            for (let [key, value] of formData.entries()) {
                if (value === 'on') {
                    options[key] = true;
                } else if (value === '') {
                    options[key] = false;
                } else {
                    options[key] = value;
                }
            }
            
            // Handle unchecked checkboxes
            const checkboxes = ['caseInsensitive', 'fixedString', 'wholeWords', 'recursive', 
                              'showLineNumbers', 'invertMatch', 'silentErrors', 'nonSourceFiles', 'dontTrimWhitespace'];
            checkboxes.forEach(name => {
                if (!(name in options)) {
                    options[name] = false;
                }
            });
            
            vscode.postMessage({
                command: 'search',
                options: options
            });
        });
        
        // Handle Enter key in input fields
        document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('searchForm').dispatchEvent(new Event('submit'));
                }
            });
        });
        
        // Handle recent term clicks
        function addRecentTermClickHandler() {
            document.querySelectorAll('.recent-term').forEach(button => {
                button.addEventListener('click', function() {
                    document.getElementById('searchTerm').value = this.textContent;
                });
            });
        }
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'setDefaults':
                    const data = message.data;
                    
                    // Set field values
                    document.getElementById('searchTerm').value = data.searchTerm || '';
                    document.getElementById('libraries').value = data.libraries || '';
                    
                    // Set checkboxes
                    const options = data.options || {};
                    Object.keys(options).forEach(key => {
                        const element = document.getElementById(key);
                        if (element && element.type === 'checkbox') {
                            element.checked = options[key];
                        }
                    });
                    
                    // Add recent terms
                    const recentTermsContainer = document.getElementById('recentTerms');
                    recentTermsContainer.innerHTML = '';
                    if (data.recentSearchTerms && data.recentSearchTerms.length > 0) {
                        data.recentSearchTerms.forEach(term => {
                            const button = document.createElement('button');
                            button.className = 'recent-term';
                            button.textContent = term;
                            button.type = 'button';
                            recentTermsContainer.appendChild(button);
                        });
                        addRecentTermClickHandler();
                    }
                    break;
                    
                case 'showMessage':
                    const statusDiv = document.getElementById('statusMessage');
                    statusDiv.textContent = message.message;
                    statusDiv.className = 'status-message status-' + message.type;
                    statusDiv.style.display = 'block';
                    
                    // Hide after 3 seconds for success/info messages
                    if (message.type !== 'error') {
                        setTimeout(() => {
                            statusDiv.style.display = 'none';
                        }, 3000);
                    }
                    break;
            }
        });
        
        // Request defaults when page loads
        vscode.postMessage({ command: 'getDefaults' });
    </script>
</body>
</html>`;
    }
}