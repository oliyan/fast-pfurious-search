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
                searchLocation: '', // Always start with empty search location field
                searchTerm: '', // Don't pre-populate search term either
                recentSearchTerms: recentSearchTerms.slice(0, 5), // Max 5 recent search terms
                recentLocations: recentLibraries.slice(0, 5), // Max 5 recent location patterns
                options: {
                    caseSensitive: defaultOptions.caseSensitive ?? false,  // Default: case insensitive
                    smartSearchRegex: defaultOptions.smartSearchRegex ?? false,  // Default: normal search
                    beforeContext: defaultOptions.beforeContext ?? 2,  // Default: 2 lines before
                    afterContext: defaultOptions.afterContext ?? 2  // Default: 2 lines after
                }
            }
        });
    }

    /**
     * Execute search with given options
     */
    private async executeSearch(formData: any): Promise<void> {
        try {
            // Parse search location (supports LIB, LIB/FILE, LIB/FILE/MEMBER patterns)
            const searchLocation = formData.searchLocation || formData.libraries; // Support both old and new field names
            const libraries = this.parseSearchLocation(searchLocation);

            if (libraries.length === 0) {
                this.showWebviewError('Please enter at least one search location');
                return;
            }

            if (!formData.searchTerm || formData.searchTerm.trim().length === 0) {
                this.showWebviewError('Please enter a search term');
                return;
            }

            const searchTerm = formData.searchTerm.trim();
            const isRegexMode = formData.smartSearchRegex === true || formData.searchMode === 'regex';

            // Build search options
            const options: FastPfuriousOptions = {
                searchTerm: searchTerm,
                libraries,
                caseSensitive: formData.caseSensitive === true,  // Default false (case insensitive)
                smartSearchRegex: isRegexMode,  // Default false (normal search)
                beforeContext: formData.beforeContext && formData.beforeContext > 0 ? parseInt(formData.beforeContext) : undefined,
                afterContext: formData.afterContext && formData.afterContext > 0 ? parseInt(formData.afterContext) : undefined
            };

            // Update recent locations (complete pattern) and search history
            await this.settingsManager.updateRecentLibraries(searchLocation);
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
     * Parse search location into library paths
     * Supports formats: MYLIB, MYLIB/QRPGSRC, MYLIB/QRPGSRC/PROG*, star-slash-QCLSRC
     * Wildcards only allowed at END of words
     */
    private parseSearchLocation(searchLocation: string): string[] {
        const locations = searchLocation
            .split(',')
            .map((loc: string) => loc.trim().toUpperCase())
            .filter((loc: string) => loc.length > 0);

        const libraries: string[] = [];

        for (const location of locations) {
            // Validate wildcard placement (only at end of words)
            const parts = location.split('/');
            for (const part of parts) {
                if (part.includes('*') && !part.endsWith('*') && part !== '*') {
                    throw new Error(`Invalid wildcard placement in "${location}". Wildcards only allowed at end: e.g., PROD*, not *PROD or PR*OD`);
                }
                // Reject empty components (except explicit *)
                if (part === '' && location !== '*') {
                    throw new Error(`Invalid search location "${location}". Empty components not allowed. Use explicit '*' if needed.`);
                }
            }

            // Convert to library path based on format
            if (parts.length === 1) {
                // Simple library: MYLIB or PROD*
                libraries.push(parts[0]);
            } else if (parts.length === 2) {
                // Library + File: MYLIB/QRPGSRC or */QCLSRC
                libraries.push(`${parts[0]}/${parts[1]}`);
            } else if (parts.length === 3) {
                // Library + File + Member: MYLIB/QRPGSRC/PROG*
                libraries.push(`${parts[0]}/${parts[1]}/${parts[2]}`);
            } else {
                throw new Error(`Invalid search location format: "${location}". Use MYLIB, MYLIB/FILE, or MYLIB/FILE/MEMBER`);
            }
        }

        return libraries;
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

        /* Tab styling */
        .search-tabs {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 20px;
        }

        .tab-button {
            flex: 1;
            padding: 12px;
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }

        .tab-button.active {
            color: var(--vscode-focusBorder);
            border-bottom-color: var(--vscode-focusBorder);
            font-weight: 600;
        }

        .tab-button:hover:not(.active) {
            color: var(--vscode-foreground);
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

        .quote-warning {
            display: none;
            background-color: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            color: var(--vscode-inputValidation-warningForeground);
            padding: 6px 10px;
            margin-top: 6px;
            border-radius: 3px;
            font-size: 12px;
        }

        .quote-warning.show {
            display: block;
        }

        .mode-tip {
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
            padding: 8px 12px;
            margin-top: 6px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
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
            background-color: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background));
            border: 2px solid var(--vscode-editorHoverWidget-border, var(--vscode-focusBorder));
            border-radius: 4px;
            padding: 12px 16px;
            max-width: 400px;
            font-size: 13px;
            line-height: 1.5;
            z-index: 10000;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
            color: var(--vscode-foreground);
        }

        .help-tooltip code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 2px;
            font-family: monospace;
        }

        .context-input {
            display: none;
            width: 120px;
            margin-left: 12px;
        }

        .context-input.show {
            display: inline-block;
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

        <!-- Tab Selection -->
        <div class="search-tabs">
            <button id="basicSearchTab" class="tab-button active" type="button">Basic Search</button>
            <button id="regexSearchTab" class="tab-button" type="button">REGEX Search</button>
        </div>

        <form id="searchForm">
            <!-- Basic Search Input -->
            <div class="form-group" id="basicSearchGroup">
                <label for="basicSearchTerm">Search Term:</label>
                <input type="text" id="basicSearchTerm" name="searchTerm" placeholder="Enter text to search for..." required>
                <div class="quote-warning" id="basicQuoteWarning">
                    ⚠️ Your search contains quotes. The quote characters will be included in the search.
                </div>
                <div class="mode-tip" id="basicModeTip">
                    💡 Tip: Multi-word searches are treated as phrases in Basic Search mode
                </div>
                <div class="recent-terms" id="basicRecentTerms"></div>
            </div>

            <!-- REGEX Search Input -->
            <div class="form-group" id="regexSearchGroup" style="display: none;">
                <label for="regexSearchTerm">Search Term:</label>
                <input type="text" id="regexSearchTerm" name="searchTerm" placeholder="Enter regex pattern...">
                <div class="quote-warning" id="regexQuoteWarning">
                    ⚠️ Your search contains quotes. The quote characters will be included in the search.
                </div>
                <div class="mode-tip" id="regexModeTip">
                    💡 Tip: Use regex patterns like \bWORD\b for whole words, ^START for line start
                </div>
                <div class="recent-terms" id="regexRecentTerms"></div>
            </div>

            <div class="form-group">
                <label for="searchLocation">
                    Search Location:
                    <span class="help-icon" data-help="searchLocation">?</span>
                </label>
                <input type="text" id="searchLocation" name="searchLocation" placeholder="Mylib/file/memb*" required>
                <div class="placeholder-text">Examples: MYLIB, MYLIB/QRPGSRC, */QCLSRC, MYLIB/QRPGSRC/PROG*</div>
                <div class="recent-terms" id="recentLocations"></div>
            </div>

            <div class="form-group">
                <label>Search Options:</label>
                <div class="checkbox-item">
                    <input type="checkbox" id="caseSensitive" name="caseSensitive">
                    <label for="caseSensitive" style="display: inline; font-weight: normal;">Case Sensitive</label>
                    <span class="help-icon" data-help="caseSensitive">?</span>
                </div>
                <div class="checkbox-item">
                    <input type="checkbox" id="showContextLines" name="showContextLines">
                    <label for="showContextLines" style="display: inline; font-weight: normal;">Show Context Lines (After)</label>
                    <span class="help-icon" data-help="contextLines">?</span>
                    <input type="number" id="afterContext" name="afterContext" class="context-input" min="0" max="50" value="3" placeholder="Lines (0-50)">
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
        let currentSearchMode = 'basic'; // Track current mode

        // Help tooltip content
        const helpContent = {
            caseSensitive: 'When checked, search will match exact case. Default is OFF (case-insensitive).<br><br>Example: With this OFF, "SQL" matches "sql", "SQL", "Sql"',
            searchLocation: 'Specify where to search. Supports library, file, and member patterns with wildcards (asterisk only at end).<br><br><b>Examples:</b><br>• <code>MYLIB</code> - entire library<br>• <code>MYLIB/QRPGLESRC</code> - specific file<br>• <code>MYLIB/QRPGLESRC/PROG*</code> - members starting with PROG<br>• <code>star/QCLSRC</code> - QCLSRC in all libraries<br>• <code>AGOstar/QRPGLESRC/star</code> - all members in QRPGLESRC for libraries starting with AGO',
            contextLines: 'Show N lines after each match for context. Range: 0-50 lines.<br><br><b>Example:</b> Entering 3 will show the 3 lines following each match.<br><br><b>Note:</b> PFGREP only supports "after" context lines, not "before".'
        };

        // Tab switching logic
        document.getElementById('basicSearchTab').addEventListener('click', function() {
            if (currentSearchMode === 'basic') return;
            currentSearchMode = 'basic';
            document.getElementById('basicSearchTab').classList.add('active');
            document.getElementById('regexSearchTab').classList.remove('active');

            // Show/hide appropriate search groups
            document.getElementById('basicSearchGroup').style.display = 'block';
            document.getElementById('regexSearchGroup').style.display = 'none';
        });

        document.getElementById('regexSearchTab').addEventListener('click', function() {
            if (currentSearchMode === 'regex') return;
            currentSearchMode = 'regex';
            document.getElementById('regexSearchTab').classList.add('active');
            document.getElementById('basicSearchTab').classList.remove('active');

            // Show/hide appropriate search groups
            document.getElementById('basicSearchGroup').style.display = 'none';
            document.getElementById('regexSearchGroup').style.display = 'block';
        });

        // Quote detection and warning for Basic Search
        document.getElementById('basicSearchTerm').addEventListener('input', function() {
            const searchTerm = this.value;
            const quoteWarning = document.getElementById('basicQuoteWarning');

            if (searchTerm.includes('"') || searchTerm.includes("'")) {
                quoteWarning.classList.add('show');
            } else {
                quoteWarning.classList.remove('show');
            }
        });

        // Quote detection and warning for REGEX Search
        document.getElementById('regexSearchTerm').addEventListener('input', function() {
            const searchTerm = this.value;
            const quoteWarning = document.getElementById('regexQuoteWarning');

            if (searchTerm.includes('"') || searchTerm.includes("'")) {
                quoteWarning.classList.add('show');
            } else {
                quoteWarning.classList.remove('show');
            }
        });

        // Show/hide context lines input based on checkbox
        document.getElementById('showContextLines').addEventListener('change', function() {
            const contextInput = document.getElementById('afterContext');
            if (this.checked) {
                contextInput.classList.add('show');
            } else {
                contextInput.classList.remove('show');
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

            // Get search term from active tab
            const searchTerm = currentSearchMode === 'basic'
                ? document.getElementById('basicSearchTerm').value.trim()
                : document.getElementById('regexSearchTerm').value.trim();

            const isRegexMode = currentSearchMode === 'regex';
            const showContext = document.getElementById('showContextLines').checked;
            const afterContextValue = document.getElementById('afterContext').value;

            // Validate regex if in regex mode
            if (isRegexMode && !validateRegex(searchTerm)) {
                showErrorModal();
                return;
            }

            // Validate context lines
            if (showContext) {
                const afterLines = parseInt(afterContextValue);
                if (isNaN(afterLines) || afterLines < 0 || afterLines > 50) {
                    alert('Context lines must be between 0 and 50');
                    return;
                }
            }

            const options = {
                searchTerm: searchTerm,
                searchLocation: document.getElementById('searchLocation').value,
                caseSensitive: document.getElementById('caseSensitive').checked,
                searchMode: currentSearchMode,
                afterContext: showContext && afterContextValue ? parseInt(afterContextValue) : 0
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

        // Handle recent search term clicks for Basic Search
        function addBasicRecentTermClickHandler() {
            document.querySelectorAll('#basicRecentTerms .recent-term').forEach(button => {
                button.addEventListener('click', function() {
                    document.getElementById('basicSearchTerm').value = this.textContent;
                    // Trigger input event to check for quotes
                    document.getElementById('basicSearchTerm').dispatchEvent(new Event('input'));
                });
            });
        }

        // Handle recent search term clicks for REGEX Search
        function addRegexRecentTermClickHandler() {
            document.querySelectorAll('#regexRecentTerms .recent-term').forEach(button => {
                button.addEventListener('click', function() {
                    document.getElementById('regexSearchTerm').value = this.textContent;
                    // Trigger input event to check for quotes
                    document.getElementById('regexSearchTerm').dispatchEvent(new Event('input'));
                });
            });
        }

        // Handle recent location clicks (replaces text)
        function addRecentLocationClickHandler() {
            document.querySelectorAll('.recent-library').forEach(button => {
                button.addEventListener('click', function() {
                    document.getElementById('searchLocation').value = this.textContent;
                });
            });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
                case 'setDefaults':
                    const data = message.data;

                    // Populate both search inputs (they're independent)
                    document.getElementById('basicSearchTerm').value = data.searchTerm || '';
                    document.getElementById('regexSearchTerm').value = data.searchTerm || '';
                    document.getElementById('searchLocation').value = data.searchLocation || '';

                    const options = data.options || {};
                    document.getElementById('caseSensitive').checked = options.caseSensitive || false;

                    // Handle context lines
                    if (options.afterContext && options.afterContext > 0) {
                        document.getElementById('showContextLines').checked = true;
                        document.getElementById('afterContext').classList.add('show');
                        document.getElementById('afterContext').value = options.afterContext || 3;
                    }

                    // Add recent search terms for Basic Search
                    const basicRecentTermsContainer = document.getElementById('basicRecentTerms');
                    basicRecentTermsContainer.innerHTML = '';
                    if (data.recentSearchTerms && data.recentSearchTerms.length > 0) {
                        data.recentSearchTerms.forEach(term => {
                            const button = document.createElement('button');
                            button.className = 'recent-term';
                            button.textContent = term;
                            button.type = 'button';
                            basicRecentTermsContainer.appendChild(button);
                        });
                        addBasicRecentTermClickHandler();
                    }

                    // Add recent search terms for REGEX Search
                    const regexRecentTermsContainer = document.getElementById('regexRecentTerms');
                    regexRecentTermsContainer.innerHTML = '';
                    if (data.recentSearchTerms && data.recentSearchTerms.length > 0) {
                        data.recentSearchTerms.forEach(term => {
                            const button = document.createElement('button');
                            button.className = 'recent-term';
                            button.textContent = term;
                            button.type = 'button';
                            regexRecentTermsContainer.appendChild(button);
                        });
                        addRegexRecentTermClickHandler();
                    }

                    // Add recent locations
                    const recentLocationsContainer = document.getElementById('recentLocations');
                    recentLocationsContainer.innerHTML = '';
                    if (data.recentLocations && data.recentLocations.length > 0) {
                        data.recentLocations.forEach(locationPattern => {
                            const button = document.createElement('button');
                            button.className = 'recent-library';
                            button.textContent = locationPattern;
                            button.type = 'button';
                            recentLocationsContainer.appendChild(button);
                        });
                        addRecentLocationClickHandler();
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