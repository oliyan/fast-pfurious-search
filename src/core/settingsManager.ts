import * as vscode from 'vscode';
import { PFGREPSettings, PFGREPOptions } from '../types/interfaces';

export class SettingsManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Initialize settings on first activation
     */
    public initialize(): void {
        // Ensure default settings exist
        const settings = this.getGlobalSettings();
        this.saveGlobalSettings(settings);
    }

    /**
     * Get global settings (not per-workspace as required)
     */
    public getGlobalSettings(): PFGREPSettings {
        return {
            recentLibraries: this.context.globalState.get('pfgrep.recentLibraries', []),
            recentSearchTerms: this.context.globalState.get('pfgrep.recentSearchTerms', []),
            defaultOptions: this.context.globalState.get('pfgrep.defaultOptions', {
                caseInsensitive: true,  // Default to case insensitive (per requirements)
                recursive: true,        // Default to recursive (per requirements)
                wholeWords: false,
                fixedString: false
            }),
            resultsSortOrder: this.context.globalState.get('pfgrep.resultsSortOrder', 'name'),
            maxRecentSearches: this.context.globalState.get('pfgrep.maxRecentSearches', 10),
            windowSize: this.context.globalState.get('pfgrep.windowSize', { width: 500, height: 400 }),
            windowPosition: this.context.globalState.get('pfgrep.windowPosition', { x: 100, y: 100 }),
            maxResultWindows: this.context.globalState.get('pfgrep.maxResultWindows', 5),
            defaultLibraries: this.getDefaultLibrariesFromConfig(),
            lastUsedLibraries: this.context.globalState.get('pfgrep.lastUsedLibraries', '')
        };
    }

    /**
     * Get default libraries from VS Code configuration
     */
    private getDefaultLibrariesFromConfig(): string {
        const config = vscode.workspace.getConfiguration('pfgrep-ibmi');
        return config.get('defaultLibraries', '');
    }

    /**
     * Save global settings
     */
    public async saveGlobalSettings(settings: PFGREPSettings): Promise<void> {
        await Promise.all([
            this.context.globalState.update('pfgrep.recentLibraries', settings.recentLibraries),
            this.context.globalState.update('pfgrep.recentSearchTerms', settings.recentSearchTerms),
            this.context.globalState.update('pfgrep.defaultOptions', settings.defaultOptions),
            this.context.globalState.update('pfgrep.resultsSortOrder', settings.resultsSortOrder),
            this.context.globalState.update('pfgrep.maxRecentSearches', settings.maxRecentSearches),
            this.context.globalState.update('pfgrep.windowSize', settings.windowSize),
            this.context.globalState.update('pfgrep.windowPosition', settings.windowPosition),
            this.context.globalState.update('pfgrep.maxResultWindows', settings.maxResultWindows),
            this.context.globalState.update('pfgrep.lastUsedLibraries', settings.lastUsedLibraries || '')
        ]);
    }

    /**
     * Update recent libraries (global, not per-workspace)
     */
    public async updateRecentLibraries(selectedLibraries: string[]): Promise<void> {
        const settings = this.getGlobalSettings();
        
        // Add new libraries to front of list, remove duplicates
        const updated = [...selectedLibraries, ...settings.recentLibraries]
            .filter((lib, index, arr) => arr.indexOf(lib) === index)
            .slice(0, 20); // Keep last 20 libraries
        
        settings.recentLibraries = updated;
        await this.saveGlobalSettings(settings);
    }

    /**
     * Update last used libraries (raw string format)
     */
    public async updateLastUsedLibraries(librariesString: string): Promise<void> {
        const settings = this.getGlobalSettings();
        settings.lastUsedLibraries = librariesString;
        await this.saveGlobalSettings(settings);
    }

    /**
     * Update search history (global)
     */
    public async updateSearchHistory(searchTerm: string): Promise<void> {
        const settings = this.getGlobalSettings();
        
        const updated = [searchTerm, ...settings.recentSearchTerms]
            .filter((term, index, arr) => arr.indexOf(term) === index)
            .slice(0, settings.maxRecentSearches);
        
        settings.recentSearchTerms = updated;
        await this.saveGlobalSettings(settings);
    }

    /**
     * Update window size and position
     */
    public async updateWindowBounds(
        size: { width: number; height: number },
        position: { x: number; y: number }
    ): Promise<void> {
        const settings = this.getGlobalSettings();
        settings.windowSize = size;
        settings.windowPosition = position;
        await this.saveGlobalSettings(settings);
    }

    /**
     * Update default search options
     */
    public async updateDefaultOptions(options: Partial<PFGREPOptions>): Promise<void> {
        const settings = this.getGlobalSettings();
        settings.defaultOptions = { ...settings.defaultOptions, ...options };
        await this.saveGlobalSettings(settings);
    }

    /**
     * Update results sort order
     */
    public async updateSortOrder(sortOrder: 'name' | 'hits' | 'library' | 'member'): Promise<void> {
        const settings = this.getGlobalSettings();
        settings.resultsSortOrder = sortOrder;
        await this.saveGlobalSettings(settings);
    }

    /**
     * Get recent libraries
     */
    public getRecentLibraries(): string[] {
        return this.getGlobalSettings().recentLibraries;
    }

    /**
     * Get recent search terms
     */
    public getRecentSearchTerms(): string[] {
        return this.getGlobalSettings().recentSearchTerms;
    }

    /**
     * Get default search options
     */
    public getDefaultOptions(): Partial<PFGREPOptions> {
        return this.getGlobalSettings().defaultOptions;
    }

    /**
     * Get default libraries from configuration
     */
    public getDefaultLibraries(): string {
        return this.getDefaultLibrariesFromConfig();
    }

    /**
     * Get last used libraries
     */
    public getLastUsedLibraries(): string {
        return this.getGlobalSettings().lastUsedLibraries || '';
    }

    /**
     * Get window size
     */
    public getWindowSize(): { width: number; height: number } {
        return this.getGlobalSettings().windowSize;
    }

    /**
     * Get window position
     */
    public getWindowPosition(): { x: number; y: number } {
        return this.getGlobalSettings().windowPosition;
    }

    /**
     * Get max result windows
     */
    public getMaxResultWindows(): number {
        return this.getGlobalSettings().maxResultWindows;
    }

    /**
     * Get results sort order
     */
    public getSortOrder(): 'name' | 'hits' | 'library' | 'member' {
        return this.getGlobalSettings().resultsSortOrder;
    }

    /**
     * Clear all recent libraries
     */
    public async clearRecentLibraries(): Promise<void> {
        const settings = this.getGlobalSettings();
        settings.recentLibraries = [];
        await this.saveGlobalSettings(settings);
    }

    /**
     * Clear all search history
     */
    public async clearSearchHistory(): Promise<void> {
        const settings = this.getGlobalSettings();
        settings.recentSearchTerms = [];
        await this.saveGlobalSettings(settings);
    }

    /**
     * Reset all settings to defaults
     */
    public async resetToDefaults(): Promise<void> {
        const defaultSettings: PFGREPSettings = {
            recentLibraries: [],
            recentSearchTerms: [],
            defaultOptions: {
                caseInsensitive: true,
                recursive: true,
                wholeWords: false,
                fixedString: false
            },
            resultsSortOrder: 'name',
            maxRecentSearches: 10,
            windowSize: { width: 500, height: 400 },
            windowPosition: { x: 100, y: 100 },
            maxResultWindows: 5,
            defaultLibraries: '',
            lastUsedLibraries: ''
        };
        
        await this.saveGlobalSettings(defaultSettings);
    }

    /**
     * Export settings to JSON
     */
    public exportSettings(): string {
        const settings = this.getGlobalSettings();
        return JSON.stringify(settings, null, 2);
    }

    /**
     * Import settings from JSON
     */
    public async importSettings(jsonSettings: string): Promise<void> {
        try {
            const settings = JSON.parse(jsonSettings) as PFGREPSettings;
            
            // Validate settings structure
            if (this.validateSettings(settings)) {
                await this.saveGlobalSettings(settings);
            } else {
                throw new Error('Invalid settings format');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to import settings: ${errorMessage}`);
        }
    }

    /**
     * Validate settings structure
     */
    private validateSettings(settings: any): settings is PFGREPSettings {
        return (
            settings &&
            Array.isArray(settings.recentLibraries) &&
            Array.isArray(settings.recentSearchTerms) &&
            typeof settings.defaultOptions === 'object' &&
            typeof settings.resultsSortOrder === 'string' &&
            typeof settings.maxRecentSearches === 'number' &&
            typeof settings.windowSize === 'object' &&
            typeof settings.windowPosition === 'object' &&
            typeof settings.maxResultWindows === 'number'
        );
    }
}