import * as vscode from 'vscode';
import { FastPfuriousOptions } from '../types/interfaces';
import { SettingsManager } from '../core/settingsManager';
import { FastPfuriousResultsManager } from './resultsManager';

export class FastPfuriousSearchModal {
    private context: vscode.ExtensionContext;
    private settingsManager: SettingsManager;
    private resultsManager: FastPfuriousResultsManager;
    private panel: vscode.WebviewPanel | undefined;

    constructor(context: vscode.ExtensionContext, resultsManager: FastPfuriousResultsManager) {
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
            'fastPfuriousSearch',
            'Fast & PF-urious Search',
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

        const recentSearchTerms = this.settingsManager.getRecentSearchTerms();
        const recentLibraries = this.settingsManager.getRecentLibraries();
        const defaultOptions = this.settingsManager.getDefaultOptions();

        this.panel.webview.postMessage({
            command: 'setDefaults',
            data: {
                libraries: '', // Always start with empty libraries field
                searchTerm: '', // Don't pre-populate search term either
                recentSearchTerms: recentSearchTerms.slice(0, 5), // Max 5 recent search terms
                recentLibraries: recentLibraries.slice(0, 5), // Max 5 recent library patterns
                options: {
                    caseSensitive: defaultOptions.caseSensitive ?? false,  // Default: case insensitive
                    smartSearchRegex: defaultOptions.smartSearchRegex ?? false,  // Default: normal search
                    afterContext: defaultOptions.afterContext ?? 0  // Default: no context lines
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

            let searchTerm = formData.searchTerm.trim();
            const isRegexMode = formData.smartSearchRegex === true;

            // In Normal Search mode (not regex), auto-wrap multi-word searches in quotes
            if (!isRegexMode && searchTerm.includes(' ') && !searchTerm.startsWith('"') && !searchTerm.endsWith('"')) {
                searchTerm = `"${searchTerm}"`;
            }

            // Build search options
            const options: FastPfuriousOptions = {
                searchTerm: searchTerm,
                libraries,
                caseSensitive: formData.caseSensitive === true,  // Default false (case insensitive)
                smartSearchRegex: formData.smartSearchRegex === true,  // Default false (normal search)
                afterContext: formData.afterContext && formData.afterContext > 0 ? parseInt(formData.afterContext) : undefined
            };

            // Update recent libraries (complete pattern) and search history
            await this.settingsManager.updateRecentLibraries(formData.libraries);
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
    <title>Fast & PF-urious Search</title>
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
            max-width: 600px;
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

        input[type="text"], input[type="number"] {
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

        input[type="text"]:focus, input[type="number"]:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .recent-terms {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
        }

        .recent-term, .recent-library {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 3px;
            padding: 4px 8px;
            cursor: pointer;
            font-size: 12px;
        }

        .recent-term:hover, .recent-library:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .checkbox-item {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }

        input[type="checkbox"] {
            margin: 0;
        }

        .help-icon {
            display: inline-block;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background-color: var(--vscode-descriptionForeground);
            color: var(--vscode-editor-background);
            text-align: center;
            line-height: 16px;
            font-size: 12px;
            cursor: pointer;
            margin-left: 6px;
            user-select: none;
        }

        .help-icon:hover {
            background-color: var(--vscode-focusBorder);
        }

        .help-tooltip {
            position: fixed;
            background-color: var(--vscode-editorHoverWidget-background);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            border-radius: 4px;
            padding: 8px 12px;
            max-width: 300px;
            font-size: 12px;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .mode-tip {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
            padding: 8px 12px;
            margin-top: 6px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
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

        .error-modal {
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 2px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 6px;
            padding: 20px 24px;
            min-width: 300px;
            text-align: center;
            z-index: 2000;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
        }

        .error-modal.show {
            display: block;
            animation: shake 0.5s;
        }

        @keyframes shake {
            0%, 100% { transform: translate(-50%, -50%) translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translate(-50%, -50%) translateX(-10px); }
            20%, 40%, 60%, 80% { transform: translate(-50%, -50%) translateX(10px); }
        }

        .error-modal-content {
            color: var(--vscode-errorForeground);
            font-weight: 600;
            margin-bottom: 16px;
        }

        .error-modal-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            padding: 6px 20px;
            cursor: pointer;
            font-size: 14px;
        }

        .error-modal-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>Fast & PF-urious Search</h2>

        <form id="searchForm">
            <div class="form-group">
                <label for="searchTerm">Search Term:</label>
                <input type="text" id="searchTerm" name="searchTerm" placeholder="Enter text to search for..." required>
                <div class="mode-tip" id="modeTip">
                    💡 Tip: Use quotes for exact phrases with spaces (e.g., "EXEC SQL")
                </div>
                <div class="recent-terms" id="recentTerms"></div>
            </div>

            <div class="form-group">
                <label for="libraries">Libraries:</label>
                <input type="text" id="libraries" name="libraries" placeholder="LIB1,LIB2,PROD*,*DEV" required>
                <div class="placeholder-text">Comma-separated library names or patterns (wildcards supported)</div>
                <div class="recent-terms" id="recentLibraries"></div>
            </div>

            <div class="form-group">
                <label>Search Options:</label>
                <div class="checkbox-item">
                    <input type="checkbox" id="caseSensitive" name="caseSensitive">
                    <label for="caseSensitive" style="display: inline; font-weight: normal;">Case Sensitive</label>
                    <span class="help-icon" data-help="caseSensitive">?</span>
                </div>
                <div class="checkbox-item">
                    <input type="checkbox" id="smartSearchRegex" name="smartSearchRegex">
                    <label for="smartSearchRegex" style="display: inline; font-weight: normal;">Smart-search (REGEX)</label>
                    <span class="help-icon" data-help="smartSearchRegex">?</span>
                </div>
                <div class="checkbox-item">
                    <input type="checkbox" id="afterContextEnabled" name="afterContextEnabled">
                    <label for="afterContextEnabled" style="display: inline; font-weight: normal;">Show Context Lines</label>
                    <span class="help-icon" data-help="afterContext">?</span>
                    <input type="number" id="afterContext" name="afterContext" min="0" max="50" placeholder="Lines (0-50)"
                           style="width: 120px; margin-left: 12px; display: none;">
                </div>
            </div>

            <button type="submit" class="search-button" id="searchButton">Search</button>

            <div id="statusMessage" class="status-message" style="display: none;"></div>
        </form>
    </div>

    <!-- Error Modal -->
    <div id="errorModal" class="error-modal">
        <div class="error-modal-content">❌ Error: Invalid REGEX Pattern</div>
        <button class="error-modal-button" onclick="closeErrorModal()">OK</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Help tooltip content
        const helpContent = {
            caseSensitive: 'When checked, search will match exact case. Default is OFF (case-insensitive).<br><br>Example: With this OFF, "SQL" matches "sql", "SQL", "Sql"',
            smartSearchRegex: 'Enable regex pattern matching. Default is OFF (normal text search).<br><br>Example: <code>\\bCVTDT\\b</code> matches whole word CVTDT',
            afterContext: 'Show N lines after each match for context. Range: 0-50 lines.<br><br>Example: 3 lines shows the 3 lines following each match'
        };

        // Show/hide context lines input based on checkbox
        document.getElementById('afterContextEnabled').addEventListener('change', function() {
            const contextInput = document.getElementById('afterContext');
            contextInput.style.display = this.checked ? 'inline-block' : 'none';
            if (!this.checked) {
                contextInput.value = '';
            } else {
                contextInput.value = contextInput.value || '3';  // Default to 3 lines
            }
        });

        // Update mode tip based on regex checkbox
        document.getElementById('smartSearchRegex').addEventListener('change', function() {
            const modeTip = document.getElementById('modeTip');
            if (this.checked) {
                modeTip.textContent = '💡 Tip: Use regex patterns like \\\\bWORD\\\\b for whole words, ^START for line start';
            } else {
                modeTip.textContent = '💡 Tip: Use quotes for exact phrases with spaces (e.g., "EXEC SQL")';
            }
        });

        // Help icon click handlers
        let currentTooltip = null;
        document.querySelectorAll('.help-icon').forEach(icon => {
            icon.addEventListener('click', function(e) {
                e.stopPropagation();

                // Remove existing tooltip
                if (currentTooltip) {
                    currentTooltip.remove();
                    currentTooltip = null;
                }

                const helpKey = this.getAttribute('data-help');
                const content = helpContent[helpKey];

                if (content) {
                    const tooltip = document.createElement('div');
                    tooltip.className = 'help-tooltip';
                    tooltip.innerHTML = content;
                    document.body.appendChild(tooltip);

                    // Position near the icon
                    const rect = this.getBoundingClientRect();
                    tooltip.style.left = rect.left + 'px';
                    tooltip.style.top = (rect.bottom + 8) + 'px';

                    currentTooltip = tooltip;
                }
            });
        });

        // Close tooltip when clicking elsewhere
        document.addEventListener('click', function() {
            if (currentTooltip) {
                currentTooltip.remove();
                currentTooltip = null;
            }
        });

        // Validate regex pattern
        function validateRegex(pattern) {
            try {
                new RegExp(pattern);
                return true;
            } catch (e) {
                return false;
            }
        }

        // Show error modal
        function showErrorModal() {
            const modal = document.getElementById('errorModal');
            modal.classList.add('show');
        }

        // Close error modal
        function closeErrorModal() {
            const modal = document.getElementById('errorModal');
            modal.classList.remove('show');
        }

        // Handle form submission
        document.getElementById('searchForm').addEventListener('submit', function(e) {
            e.preventDefault();

            const searchTerm = document.getElementById('searchTerm').value.trim();
            const isRegexMode = document.getElementById('smartSearchRegex').checked;
            const afterContextEnabled = document.getElementById('afterContextEnabled').checked;
            const afterContextValue = document.getElementById('afterContext').value;

            // Validate regex if in regex mode
            if (isRegexMode && !validateRegex(searchTerm)) {
                showErrorModal();
                return;
            }

            // Validate after context lines
            if (afterContextEnabled) {
                const contextLines = parseInt(afterContextValue);
                if (isNaN(contextLines) || contextLines < 0 || contextLines > 50) {
                    alert('Context lines must be between 0 and 50');
                    return;
                }
            }

            const options = {
                searchTerm: searchTerm,
                libraries: document.getElementById('libraries').value,
                caseSensitive: document.getElementById('caseSensitive').checked,
                smartSearchRegex: isRegexMode,
                afterContext: afterContextEnabled && afterContextValue ? parseInt(afterContextValue) : 0
            };

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

        // Handle recent search term clicks (replaces text)
        function addRecentTermClickHandler() {
            document.querySelectorAll('.recent-term').forEach(button => {
                button.addEventListener('click', function() {
                    document.getElementById('searchTerm').value = this.textContent;
                });
            });
        }

        // Handle recent library clicks (appends text)
        function addRecentLibraryClickHandler() {
            document.querySelectorAll('.recent-library').forEach(button => {
                button.addEventListener('click', function() {
                    const librariesInput = document.getElementById('libraries');
                    const currentValue = librariesInput.value.trim();
                    const newLibrary = this.textContent;

                    if (currentValue) {
                        librariesInput.value = currentValue + ',' + newLibrary;
                    } else {
                        librariesInput.value = newLibrary;
                    }
                });
            });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
                case 'setDefaults':
                    const data = message.data;

                    document.getElementById('searchTerm').value = data.searchTerm || '';
                    document.getElementById('libraries').value = data.libraries || '';

                    const options = data.options || {};
                    document.getElementById('caseSensitive').checked = options.caseSensitive || false;
                    document.getElementById('smartSearchRegex').checked = options.smartSearchRegex || false;

                    if (options.afterContext && options.afterContext > 0) {
                        document.getElementById('afterContextEnabled').checked = true;
                        document.getElementById('afterContext').value = options.afterContext;
                        document.getElementById('afterContext').style.display = 'inline-block';
                    }

                    // Add recent search terms
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

                    // Add recent libraries
                    const recentLibrariesContainer = document.getElementById('recentLibraries');
                    recentLibrariesContainer.innerHTML = '';
                    if (data.recentLibraries && data.recentLibraries.length > 0) {
                        data.recentLibraries.forEach(libraryPattern => {
                            const button = document.createElement('button');
                            button.className = 'recent-library';
                            button.textContent = libraryPattern;
                            button.type = 'button';
                            recentLibrariesContainer.appendChild(button);
                        });
                        addRecentLibraryClickHandler();
                    }
                    break;

                case 'showMessage':
                    const statusDiv = document.getElementById('statusMessage');
                    statusDiv.textContent = message.message;
                    statusDiv.className = 'status-message status-' + message.type;
                    statusDiv.style.display = 'block';

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