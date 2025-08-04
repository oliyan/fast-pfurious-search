import * as vscode from 'vscode';

// PFGREP search options interface
export interface PFGREPOptions {
    // Required
    searchTerm: string;
    libraries: string[];
    
    // Main UI Options (Quick Search Mode)
    caseInsensitive?: boolean;     // -i flag
    fixedString?: boolean;         // -F flag (vs regex)
    wholeWords?: boolean;          // -w flag
    recursive?: boolean;           // -r flag
    
    // Advanced Options (Advanced Search Mode)
    showLineNumbers?: boolean;     // -n flag
    maxMatches?: number;           // -m num flag
    afterContext?: number;         // -A num flag
    invertMatch?: boolean;         // -v flag
    silentErrors?: boolean;        // -s flag
    nonSourceFiles?: boolean;      // -p flag
    dontTrimWhitespace?: boolean;  // -t flag
    
    // Additional PFGREP flags
    showMatchingFiles?: boolean;   // -l flag
    showNonMatchingFiles?: boolean; // -L flag
    countOnly?: boolean;           // -c flag
    quietMode?: boolean;           // -q flag
    alwaysShowFilename?: boolean;  // -H flag
    neverShowFilename?: boolean;   // -h flag
    matchWholeLine?: boolean;      // -x flag
}

// Search result interfaces
export interface SearchHitLine {
    number: number;
    content: string;
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
    searchOptions: PFGREPOptions;
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
export interface PFGREPSettings {
    recentLibraries: string[];
    recentSearchTerms: string[];
    defaultOptions: Partial<PFGREPOptions>;
    resultsSortOrder: 'name' | 'hits' | 'library' | 'member';
    maxRecentSearches: number;
    windowSize: { width: number; height: number };
    windowPosition: { x: number; y: number };
    maxResultWindows: number;
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
    options: PFGREPOptions;
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
    caseInsensitive: boolean;
    fixedString: boolean;
    wholeWords: boolean;
    recursive: boolean;
    showLineNumbers: boolean;
    invertMatch: boolean;
    silentErrors: boolean;
    nonSourceFiles: boolean;
    dontTrimWhitespace: boolean;
    maxMatches?: string;
    afterContext?: string;
}