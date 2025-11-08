import * as vscode from 'vscode';

// Fast & PF-urious search options interface
export interface FastPfuriousOptions {
    // Required
    searchTerm: string;
    libraries: string[];

    // Main Search Options
    caseSensitive?: boolean;       // When true, adds -i flag (inverted: OFF by default = case insensitive)
    smartSearchRegex?: boolean;    // When true, enables regex mode (OFF by default = normal/fixed string search)
    // Note: recursive is always true (hardcoded -r flag)
    // Note: maxMatches is hardcoded to 5000 (-m 5000 flag)

    // Advanced Options
    afterContext?: number;         // -A num flag (0-50 lines after each match)
}

// Search result interfaces
export interface SearchHitLine {
    number: number;
    content: string;
    isContext?: boolean;  // True if this is a context line (from -A flag), not an actual match
}

export interface SearchHit {
    path: string;
    lines: SearchHitLine[];
    readonly?: boolean;
    label?: string;
}

export interface SearchResults {
    term: string;
    hits: SearchHit[];
    searchOptions: FastPfuriousOptions;
    timestamp: Date;
    searchId: string;
}

// Library selection interfaces
export interface LibraryItem {
    name: string;
    description?: string;
    selected: boolean;
}

export interface LibraryGroup {
    name: string;
    libraries: LibraryItem[];
}

// Settings interfaces
export interface FastPfuriousSettings {
    recentLibraries: string[];
    recentSearchTerms: string[];
    defaultOptions: Partial<FastPfuriousOptions>;
    resultsSortOrder: 'name' | 'hits' | 'library' | 'member';
    maxRecentSearches: number;
    windowSize: { width: number; height: number };
    windowPosition: { x: number; y: number };
    defaultLibraries?: string;
    lastUsedLibraries?: string;
}

// Code for IBM i integration interfaces
export interface CodeForIBMiApi {
    instance?: {
        getConnection(): IBMiConnection | undefined;
    };
}

export interface IBMiConnection {
    getConfig(): any;
    getContent(): any;
    sendCommand(options: {
        command: string;
        environment?: 'ile' | 'qsh' | 'pase';
        cwd?: string;
        env?: Record<string, string>;
    }): Promise<{
        code: number;
        stdout: string;
        stderr: string;
    }>;
    validQsysName(name: string): boolean;
    currentConnectionName: string;
}

// Tree view interfaces
export interface ResultTreeItem extends vscode.TreeItem {
    children?: ResultTreeItem[];
    searchHit?: SearchHit;
    lineNumber?: number;
    memberPath?: string;
    libraryName?: string; // Added for fixing tree expansion bug
}

// Modal interfaces
export interface ModalOptions {
    title: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
}

// Search mode enumeration
export enum SearchMode {
    Quick = 'quick',
    Advanced = 'advanced'
}

// Sort options
export enum SortOrder {
    Name = 'name',
    Hits = 'hits',
    Library = 'library',
    Member = 'member'
}

// Event interfaces
export interface SearchStartedEvent {
    searchId: string;
    options: FastPfuriousOptions;
}

export interface SearchCompletedEvent {
    searchId: string;
    results: SearchResults;
}

export interface SearchCancelledEvent {
    searchId: string;
    reason: string;
}

export interface SearchErrorEvent {
    searchId: string;
    error: Error;
}

// Member path parsing interface
export interface MemberPathParts {
    asp?: string;
    library: string;
    file: string;
    member: string;
    extension: string;
    fullPath: string;
}

// Webview message interfaces
export interface WebviewMessage {
    command: string;
    [key: string]: any;
}

export interface SearchFormData {
    searchTerm: string;
    libraries: string;
    caseSensitive: boolean;
    smartSearchRegex: boolean;
    afterContext?: string;
}