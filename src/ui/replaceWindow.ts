import * as vscode from 'vscode';
import { SearchHit, ReplaceRequest, ReplaceResult, OccurrenceSelection } from '../types/interfaces';
import { ConnectionManager } from '../core/connectionManager';

type ReplaceCallback = (request: ReplaceRequest) => void;

interface GroupedLine {
    lineNumber: number;
    content: string;
    truncationRisk: boolean;
}

interface GroupedMember {
    memberPath: string;
    memberName: string;
    memberType: string;
    lines: GroupedLine[];
}

interface GroupedFile {
    fileName: string;
    members: GroupedMember[];
}

interface GroupedLibrary {
    libraryName: string;
    files: GroupedFile[];
}

export class ReplaceWindow {
    private context: vscode.ExtensionContext;
    private panel: vscode.WebviewPanel | undefined;
    private replaceCallback: ReplaceCallback;

    // Stored from show() so they're available when executeReplace message arrives
    private currentSearchTerm: string = '';
    private currentReplaceTerm: string = '';
    private currentCaseSensitive: boolean = false;

    constructor(context: vscode.ExtensionContext, replaceCallback: ReplaceCallback) {
        this.context = context;
        this.replaceCallback = replaceCallback;
    }

    /**
     * Open the replace panel (or reveal if already open) and show the "Searching…" state.
     */
    public show(
        searchTerm: string,
        replaceTerm: string,
        caseSensitive: boolean,
        searchLocation: string
    ): void {
        this.currentSearchTerm = searchTerm;
        this.currentReplaceTerm = replaceTerm;
        this.currentCaseSensitive = caseSensitive;

        if (this.panel) {
            this.panel.reveal();
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'fastPfuriousReplace',
                'Fast & PF-urious: Search & Replace',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: []
                }
            );

            this.panel.webview.html = this.getWebviewContent();

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });

            this.panel.webview.onDidReceiveMessage((message) => {
                if (message.command === 'executeReplace') {
                    const request: ReplaceRequest = {
                        searchTerm: this.currentSearchTerm,
                        replaceTerm: this.currentReplaceTerm,
                        caseSensitive: this.currentCaseSensitive,
                        selectedOccurrences: message.selectedOccurrences as OccurrenceSelection[]
                    };
                    this.replaceCallback(request);
                }
            });
        }

        this.panel.webview.postMessage({
            command: 'init',
            searchTerm,
            replaceTerm,
            caseSensitive,
            searchLocation
        });
    }

    /**
     * Called after PFGREP completes. Groups hits (filtering context lines) and sends to webview.
     */
    public async populateResults(searchHits: SearchHit[]): Promise<void> {
        if (!this.panel) { return; }

        const grouped = await this.groupHits(
            searchHits,
            this.currentSearchTerm,
            this.currentReplaceTerm
        );

        let totalOccurrences = 0;
        let totalMembers = 0;
        for (const lib of grouped) {
            for (const file of lib.files) {
                for (const member of file.members) {
                    totalOccurrences += member.lines.length;
                    totalMembers++;
                }
            }
        }

        this.panel.webview.postMessage({
            command: 'populateResults',
            grouped,
            totalOccurrences,
            totalMembers
        });
    }

    /**
     * Called as each member completes replacement. Updates inline status icons.
     */
    public streamReplaceResult(result: ReplaceResult): void {
        if (!this.panel) { return; }
        this.panel.webview.postMessage({
            command: 'streamReplaceResult',
            result
        });
    }

    /**
     * Called once all members are processed. Renders the final summary bar.
     */
    public replaceComplete(summary: { replaced: number; notFound: number; failed: number }): void {
        if (!this.panel) { return; }
        this.panel.webview.postMessage({
            command: 'replaceComplete',
            summary
        });
    }

    /**
     * Group SearchHit[] by Library → Source File → Member.
     * Filters out context lines (replaceWindow owns this decision, per Q2).
     * Uses ConnectionManager.parseMemberPath() to avoid duplicating QSYS path parsing.
     */
    private async groupHits(
        hits: SearchHit[],
        searchTerm: string,
        replaceTerm: string
    ): Promise<GroupedLibrary[]> {
        const libraryMap = new Map<string, Map<string, GroupedMember[]>>();
        const memberTypeMap = new Map<string, string>(); // memberPath -> sourceType

        // Collect all unique members to query their types in one SQL call per library/file combo
        const toQuery: { library: string; file: string; member: string; memberPath: string }[] = [];

        for (const hit of hits) {
            const matchLines = hit.lines.filter(l => !l.isContext);
            if (matchLines.length === 0) { continue; }
            let parsed: { library: string; file: string; member: string; fullPath: string };
            try {
                parsed = ConnectionManager.parseMemberPath(hit.path);
            } catch {
                continue;
            }
            if (!memberTypeMap.has(hit.path)) {
                memberTypeMap.set(hit.path, '');
                toQuery.push({ library: parsed.library, file: parsed.file, member: parsed.member, memberPath: hit.path });
            }
        }

        // Fetch source types via SQL (one query for all members)
        const connection = ConnectionManager.getConnection();
        if (connection && toQuery.length > 0) {
            try {
                const inList = toQuery.map(m => `'${m.member}'`).join(',');
                const { library, file } = toQuery[0];
                const rows = await connection.runSQL(
                    `SELECT SYSTEM_TABLE_MEMBER, SOURCE_TYPE FROM QSYS2.SYSPARTITIONSTAT ` +
                    `WHERE SYSTEM_TABLE_SCHEMA = '${library}' AND SYSTEM_TABLE_NAME = '${file}' ` +
                    `AND SYSTEM_TABLE_MEMBER IN (${inList})`
                );
                for (const row of rows) {
                    const match = toQuery.find(m => m.member === String(row.SYSTEM_TABLE_MEMBER));
                    if (match) {
                        memberTypeMap.set(match.memberPath, String(row.SOURCE_TYPE || '').toLowerCase());
                    }
                }
            } catch {
                // source types will remain empty — display falls back to member name only
            }
        }

        for (const hit of hits) {
            const matchLines = hit.lines.filter(l => !l.isContext);
            if (matchLines.length === 0) { continue; }
            let parsed: { library: string; file: string; member: string; fullPath: string };
            try {
                parsed = ConnectionManager.parseMemberPath(hit.path);
            } catch {
                continue;
            }

            if (!libraryMap.has(parsed.library)) {
                libraryMap.set(parsed.library, new Map());
            }
            const fileMap = libraryMap.get(parsed.library)!;
            if (!fileMap.has(parsed.file)) {
                fileMap.set(parsed.file, []);
            }
            const members = fileMap.get(parsed.file)!;

            const groupedLines: GroupedLine[] = matchLines.map(l => ({
                lineNumber: l.number,
                content: l.content,
                truncationRisk: this.hasTruncationRisk(l.content, searchTerm, replaceTerm)
            }));

            members.push({
                memberPath: hit.path,
                memberName: parsed.member,
                memberType: memberTypeMap.get(hit.path) || '',
                lines: groupedLines
            });
        }

        const result: GroupedLibrary[] = [];
        for (const [libraryName, fileMap] of libraryMap) {
            const files: GroupedFile[] = [];
            for (const [fileName, members] of fileMap) {
                files.push({ fileName, members });
            }
            result.push({ libraryName, files });
        }
        return result;
    }

    private hasTruncationRisk(lineContent: string, searchTerm: string, replaceTerm: string): boolean {
        return lineContent.trimEnd().length - searchTerm.length + replaceTerm.length > 80;
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fast &amp; PF-urious: Search &amp; Replace</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 16px 20px;
            margin: 0;
        }

        .header {
            margin-bottom: 12px;
        }

        .header h2 {
            margin: 0 0 6px 0;
            font-size: 15px;
            font-weight: 600;
            word-break: break-all;
        }

        .header-meta {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .controls-bar {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 10px;
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            flex-wrap: wrap;
        }

        .select-all-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            cursor: pointer;
            user-select: none;
        }

        .occurrence-count {
            flex: 1;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .confirm-btn {
            padding: 6px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
        }

        .confirm-btn:hover:not(:disabled) {
            background-color: var(--vscode-button-hoverBackground);
        }

        .confirm-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .warning-banner {
            background-color: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            color: var(--vscode-inputValidation-warningForeground);
            padding: 8px 12px;
            border-radius: 3px;
            margin-bottom: 10px;
            font-size: 12px;
            font-weight: 500;
        }

        .results-tree {
            overflow-y: auto;
            max-height: calc(100vh - 270px);
        }

        .tree-node {
            margin: 2px 0;
        }

        .tree-node-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 3px 4px;
            border-radius: 3px;
            cursor: pointer;
            user-select: none;
        }

        .tree-node-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .toggle-icon {
            font-size: 10px;
            width: 12px;
            display: inline-block;
            color: var(--vscode-descriptionForeground);
            flex-shrink: 0;
        }

        .tree-node-label {
            font-weight: 600;
            font-size: 13px;
        }

        .file-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            font-weight: 600;
        }

        .member-label {
            font-size: 13px;
            font-weight: 600;
        }

        .tree-node-count {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .tree-children {
            margin-left: 20px;
        }

        .tree-children.collapsed {
            display: none;
        }

        .line-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 2px 4px;
            border-radius: 2px;
        }

        .line-row:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .line-number {
            font-size: 11px;
            color: var(--vscode-editorLineNumber-foreground);
            min-width: 48px;
            text-align: right;
            flex-shrink: 0;
        }

        .line-content {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
            color: var(--vscode-editor-foreground);
            white-space: pre;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .trunc-icon {
            font-size: 11px;
            color: var(--vscode-inputValidation-warningForeground);
            cursor: help;
            flex-shrink: 0;
        }

        .status-icon {
            font-size: 13px;
            min-width: 20px;
            flex-shrink: 0;
        }

        .summary-bar {
            padding: 8px 0;
            border-top: 1px solid var(--vscode-panel-border);
            margin-top: 10px;
            font-size: 12px;
            min-height: 24px;
        }

        .summary-truncation-warn {
            color: var(--vscode-inputValidation-warningForeground);
        }

        .summary-complete {
            font-weight: 600;
        }

        .searching-state {
            padding: 30px 0;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }

        .empty-state {
            padding: 30px 0;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }

        input[type="checkbox"] {
            margin: 0;
            cursor: pointer;
            flex-shrink: 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h2 id="headerTitle">Fast &amp; PF-urious: Search &amp; Replace</h2>
        <div class="header-meta" id="headerMeta"></div>
    </div>

    <div id="searchingState" class="searching-state">Searching&hellip;</div>

    <div id="mainContent" style="display:none;">
        <div class="controls-bar">
            <label class="select-all-label">
                <input type="checkbox" id="selectAll"> Select All
            </label>
            <span class="occurrence-count" id="occurrenceCount"></span>
            <button class="confirm-btn" id="confirmBtn" disabled>Confirm Replace</button>
        </div>

        <div class="warning-banner">
            &#9888; This operation is irreversible. IBM i source members have no native undo.
        </div>

        <div class="results-tree" id="resultsTree"></div>

        <div class="summary-bar" id="summaryBar"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // { el: HTMLInputElement, memberPath: string, lineNumber: number }
        let allCheckboxes = [];
        let replacing = false;

        const selectAllEl = document.getElementById('selectAll');
        const confirmBtn = document.getElementById('confirmBtn');

        // --- Tri-state Select All ---
        function updateSelectAll() {
            const total = allCheckboxes.length;
            if (total === 0) {
                selectAllEl.checked = false;
                selectAllEl.indeterminate = false;
                return;
            }
            const checked = allCheckboxes.filter(c => c.el.checked).length;
            if (checked === 0) {
                selectAllEl.checked = false;
                selectAllEl.indeterminate = false;
            } else if (checked === total) {
                selectAllEl.checked = true;
                selectAllEl.indeterminate = false;
            } else {
                selectAllEl.checked = false;
                selectAllEl.indeterminate = true;
            }
            updateConfirmBtn();
        }

        selectAllEl.addEventListener('change', function () {
            const val = this.checked;
            allCheckboxes.forEach(c => { c.el.checked = val; });
            updateGroupCheckboxes();
            updateConfirmBtn();
        });

        function updateConfirmBtn() {
            const anyChecked = allCheckboxes.some(c => c.el.checked);
            confirmBtn.disabled = !anyChecked || replacing;
        }

        // --- Group-level tri-state checkboxes ---
        function updateGroupCheckboxes() {
            document.querySelectorAll('.group-check').forEach(function (groupEl) {
                const scope = groupEl.dataset.scope;
                const value = groupEl.dataset.value;
                const kids = allCheckboxes.filter(c => c.el.dataset[scope] === value);
                if (kids.length === 0) { return; }
                const checkedCount = kids.filter(c => c.el.checked).length;
                if (checkedCount === 0) {
                    groupEl.checked = false;
                    groupEl.indeterminate = false;
                } else if (checkedCount === kids.length) {
                    groupEl.checked = true;
                    groupEl.indeterminate = false;
                } else {
                    groupEl.checked = false;
                    groupEl.indeterminate = true;
                }
            });
        }

        // --- Collapse / expand ---
        function toggleCollapse(childrenEl, iconEl) {
            const collapsed = childrenEl.classList.toggle('collapsed');
            iconEl.textContent = collapsed ? '▶' : '▼';
        }

        // --- Confirm Replace button ---
        confirmBtn.addEventListener('click', function () {
            if (replacing) { return; }
            replacing = true;
            this.textContent = 'Replacing…';
            this.disabled = true;

            const selected = allCheckboxes
                .filter(c => c.el.checked)
                .map(c => ({ memberPath: c.memberPath, lineNumber: c.lineNumber }));

            vscode.postMessage({ command: 'executeReplace', selectedOccurrences: selected });
        });

        // --- Safe DOM id key from memberPath + lineNumber ---
        function lineKey(memberPath, lineNumber) {
            return memberPath.replace(/[^a-z0-9]/gi, '_') + '_' + lineNumber;
        }

        // --- Build the results tree from grouped data ---
        function buildTree(grouped) {
            allCheckboxes = [];
            replacing = false;
            confirmBtn.textContent = 'Confirm Replace';
            confirmBtn.disabled = true;
            document.getElementById('summaryBar').innerHTML = '';
            const tree = document.getElementById('resultsTree');
            tree.innerHTML = '';
            let truncationCount = 0;

            if (!grouped || grouped.length === 0) {
                tree.innerHTML = '<div class="empty-state">No match lines found.</div>';
                updateSelectAll();
                return;
            }

            for (const lib of grouped) {
                const libNode = document.createElement('div');
                libNode.className = 'tree-node';

                const libHeader = document.createElement('div');
                libHeader.className = 'tree-node-header';

                const libToggle = document.createElement('span');
                libToggle.className = 'toggle-icon';
                libToggle.textContent = '▼';

                const libCheck = document.createElement('input');
                libCheck.type = 'checkbox';
                libCheck.className = 'group-check';
                libCheck.dataset.scope = 'library';
                libCheck.dataset.value = lib.libraryName;
                libCheck.checked = true;

                const libLabel = document.createElement('span');
                libLabel.className = 'tree-node-label';
                libLabel.textContent = lib.libraryName;

                libHeader.appendChild(libToggle);
                libHeader.appendChild(libCheck);
                libHeader.appendChild(libLabel);

                const libChildren = document.createElement('div');
                libChildren.className = 'tree-children';

                libHeader.addEventListener('click', function (e) {
                    if (e.target === libCheck) { return; }
                    toggleCollapse(libChildren, libToggle);
                });

                libCheck.addEventListener('change', function () {
                    const val = this.checked;
                    allCheckboxes
                        .filter(c => c.el.dataset.library === lib.libraryName)
                        .forEach(c => { c.el.checked = val; });
                    updateGroupCheckboxes();
                    updateSelectAll();
                });

                for (const file of lib.files) {
                    const fileNode = document.createElement('div');
                    fileNode.className = 'tree-node';

                    const fileHeader = document.createElement('div');
                    fileHeader.className = 'tree-node-header';

                    const fileToggle = document.createElement('span');
                    fileToggle.className = 'toggle-icon';
                    fileToggle.textContent = '▼';

                    const fileKey = lib.libraryName + '/' + file.fileName;

                    const fileCheck = document.createElement('input');
                    fileCheck.type = 'checkbox';
                    fileCheck.className = 'group-check';
                    fileCheck.dataset.scope = 'file';
                    fileCheck.dataset.value = fileKey;
                    fileCheck.checked = true;

                    const fileLabel = document.createElement('span');
                    fileLabel.className = 'file-label';
                    fileLabel.textContent = file.fileName;

                    fileHeader.appendChild(fileToggle);
                    fileHeader.appendChild(fileCheck);
                    fileHeader.appendChild(fileLabel);

                    const fileChildren = document.createElement('div');
                    fileChildren.className = 'tree-children';

                    fileHeader.addEventListener('click', function (e) {
                        if (e.target === fileCheck) { return; }
                        toggleCollapse(fileChildren, fileToggle);
                    });

                    fileCheck.addEventListener('change', function () {
                        const val = this.checked;
                        allCheckboxes
                            .filter(c => c.el.dataset.file === fileKey)
                            .forEach(c => { c.el.checked = val; });
                        updateGroupCheckboxes();
                        updateSelectAll();
                    });

                    for (const member of file.members) {
                        const memberNode = document.createElement('div');
                        memberNode.className = 'tree-node';

                        const memberHeader = document.createElement('div');
                        memberHeader.className = 'tree-node-header';

                        const memberToggle = document.createElement('span');
                        memberToggle.className = 'toggle-icon';
                        memberToggle.textContent = '▼';

                        const memberCheck = document.createElement('input');
                        memberCheck.type = 'checkbox';
                        memberCheck.className = 'group-check';
                        memberCheck.dataset.scope = 'member';
                        memberCheck.dataset.value = member.memberPath;
                        memberCheck.checked = true;

                        const memberLabel = document.createElement('span');
                        memberLabel.className = 'member-label';
                        memberLabel.textContent = member.memberName;

                        if (member.memberType) {
                            const memberTypeSpan = document.createElement('span');
                            memberTypeSpan.className = 'tree-node-count';
                            memberTypeSpan.textContent = '.' + member.memberType;
                            memberLabel.appendChild(memberTypeSpan);
                        }

                        const memberCount = document.createElement('span');
                        memberCount.className = 'tree-node-count';
                        memberCount.textContent = '(' + member.lines.length + ')';

                        memberHeader.appendChild(memberToggle);
                        memberHeader.appendChild(memberCheck);
                        memberHeader.appendChild(memberLabel);
                        memberHeader.appendChild(memberCount);

                        const memberChildren = document.createElement('div');
                        memberChildren.className = 'tree-children';

                        memberHeader.addEventListener('click', function (e) {
                            if (e.target === memberCheck) { return; }
                            toggleCollapse(memberChildren, memberToggle);
                        });

                        memberCheck.addEventListener('change', function () {
                            const val = this.checked;
                            allCheckboxes
                                .filter(c => c.el.dataset.member === member.memberPath)
                                .forEach(c => { c.el.checked = val; });
                            updateGroupCheckboxes();
                            updateSelectAll();
                        });

                        for (const line of member.lines) {
                            if (line.truncationRisk) { truncationCount++; }

                            const lineRow = document.createElement('div');
                            lineRow.className = 'line-row';

                            const lineCheck = document.createElement('input');
                            lineCheck.type = 'checkbox';
                            lineCheck.checked = true;
                            lineCheck.dataset.library = lib.libraryName;
                            lineCheck.dataset.file = fileKey;
                            lineCheck.dataset.member = member.memberPath;

                            lineCheck.addEventListener('change', function () {
                                updateGroupCheckboxes();
                                updateSelectAll();
                            });

                            allCheckboxes.push({
                                el: lineCheck,
                                memberPath: member.memberPath,
                                lineNumber: line.lineNumber
                            });

                            const statusIcon = document.createElement('span');
                            statusIcon.className = 'status-icon';
                            statusIcon.id = 'status-' + lineKey(member.memberPath, line.lineNumber);

                            const lineNum = document.createElement('span');
                            lineNum.className = 'line-number';
                            lineNum.textContent = 'Line ' + line.lineNumber;

                            const lineContent = document.createElement('span');
                            lineContent.className = 'line-content';
                            lineContent.textContent = '– ' + line.content;

                            lineRow.appendChild(lineCheck);
                            lineRow.appendChild(statusIcon);

                            if (line.truncationRisk) {
                                const truncIcon = document.createElement('span');
                                truncIcon.className = 'trunc-icon';
                                truncIcon.textContent = '⚠';
                                truncIcon.title = 'Result may exceed 80-character record length';
                                lineRow.appendChild(truncIcon);
                            }

                            lineRow.appendChild(lineNum);
                            lineRow.appendChild(lineContent);
                            memberChildren.appendChild(lineRow);
                        }

                        memberNode.appendChild(memberHeader);
                        memberNode.appendChild(memberChildren);
                        fileChildren.appendChild(memberNode);
                    }

                    fileNode.appendChild(fileHeader);
                    fileNode.appendChild(fileChildren);
                    libChildren.appendChild(fileNode);
                }

                libNode.appendChild(libHeader);
                libNode.appendChild(libChildren);
                tree.appendChild(libNode);
            }

            // Pre-confirm truncation summary
            const summaryBar = document.getElementById('summaryBar');
            if (truncationCount > 0) {
                summaryBar.innerHTML =
                    '<span class="summary-truncation-warn">⚠ ' + truncationCount +
                    ' occurrence(s) may exceed 80-char record length</span>';
            } else {
                summaryBar.textContent = '';
            }

            updateGroupCheckboxes();
            updateSelectAll();
        }

        // --- Apply streaming result for one member ---
        function applyStreamResult(result) {
            if (result.lineResults) {
                for (const lineResult of result.lineResults) {
                    const key = 'status-' + lineKey(lineResult.memberPath, lineResult.lineNumber);
                    const statusEl = document.getElementById(key);
                    if (!statusEl) { continue; }
                    switch (lineResult.status) {
                        case 'replaced':
                            statusEl.textContent = '✅';
                            break;
                        case 'replaced_with_truncation_risk':
                            statusEl.textContent = '⚠✅';
                            statusEl.title = 'Replaced, but result may exceed 80-char record length';
                            break;
                        case 'not_found':
                            statusEl.textContent = '🔄';
                            statusEl.title = 'Search term not found at this line';
                            break;
                        case 'authority_error':
                            statusEl.textContent = '❌';
                            statusEl.title = 'Authority error';
                            break;
                        case 'failed':
                            statusEl.textContent = '❌';
                            statusEl.title = lineResult.error || 'Failed';
                            break;
                    }
                }
            }
        }

        // --- Message handler ---
        window.addEventListener('message', function (event) {
            const msg = event.data;
            switch (msg.command) {
                case 'init':
                    document.getElementById('headerTitle').textContent =
                        '🔍 "' + msg.searchTerm + '" → "' + msg.replaceTerm + '"';
                    document.getElementById('headerMeta').textContent =
                        '📍 ' + msg.searchLocation +
                        ' | Basic | Case-' + (msg.caseSensitive ? 'sensitive' : 'insensitive');
                    document.getElementById('searchingState').style.display = 'block';
                    document.getElementById('mainContent').style.display = 'none';
                    break;

                case 'populateResults':
                    document.getElementById('searchingState').style.display = 'none';
                    document.getElementById('mainContent').style.display = 'block';
                    document.getElementById('occurrenceCount').textContent =
                        msg.totalOccurrences +
                        ' occurrence' + (msg.totalOccurrences !== 1 ? 's' : '') +
                        ' across ' +
                        msg.totalMembers + ' member' + (msg.totalMembers !== 1 ? 's' : '');
                    buildTree(msg.grouped);
                    break;

                case 'streamReplaceResult':
                    applyStreamResult(msg.result);
                    break;

                case 'replaceComplete':
                    confirmBtn.textContent = 'Replace Complete';
                    var s = msg.summary;
                    document.getElementById('summaryBar').innerHTML =
                        '<span class="summary-complete">Replace complete — ' +
                        s.replaced + ' replaced | ' +
                        s.notFound + ' skipped | ' +
                        s.failed + ' failed</span>';
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
