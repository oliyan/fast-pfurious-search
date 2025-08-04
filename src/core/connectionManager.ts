import * as vscode from 'vscode';
import { CodeForIBMiApi, IBMiConnection } from '../types/interfaces';

export class ConnectionManager {
    /**
     * Get the Code for IBM i extension API
     */
    private static getCodeForIBMiApi(): CodeForIBMiApi | undefined {
        const extension = vscode.extensions.getExtension<CodeForIBMiApi>(
            'HalcyonTechLtd.code-for-ibmi'
        );
        return extension?.isActive ? extension.exports : undefined;
    }

    /**
     * Get the active IBM i connection
     */
    public static getConnection(): IBMiConnection | undefined {
        const api = this.getCodeForIBMiApi();
        return api?.instance?.getConnection();
    }

    /**
     * Validate that Code for IBM i is available and connected, and PFGREP is installed
     */
    public static async validateEnvironment(): Promise<void> {
        // Check Code for IBM i extension
        const api = this.getCodeForIBMiApi();
        if (!api) {
            throw new Error('Code for IBM i extension is conditionally required but not available');
        }

        // Check connection
        const connection = api.instance?.getConnection();
        if (!connection) {
            throw new Error('No IBM i connection found. Please connect first.');
        }

        // Set PFGREP path directly - no validation needed
        this.pfgrepPath = '/QOpenSys/pkgs/bin/pfgrep';
        console.log('Using PFGREP at:', this.pfgrepPath);
    }

    /**
     * Check if PFGREP is installed on the remote system
     */
    private static async validatePFGREP(connection: IBMiConnection): Promise<void> {
        // Just use the known path - simple and direct
        this.pfgrepPath = '/QOpenSys/pkgs/bin/pfgrep';
        console.log(`Using PFGREP at: ${this.pfgrepPath}`);
    }

    // Store the working PFGREP path
    private static pfgrepPath: string = 'pfgrep';

    /**
     * Get the full path to PFGREP executable
     */
    public static getPFGREPPath(): string {
        return this.pfgrepPath;
    }

    /**
     * Get list of libraries on the system
     */
    public static async getLibraryList(connection: IBMiConnection): Promise<string[]> {
        try {
            const result = await connection.sendCommand({
                command: `db2 "SELECT SCHEMA_NAME FROM QSYS2.SCHEMATA WHERE SCHEMA_TYPE = 'L' ORDER BY SCHEMA_NAME"`,
                environment: 'pase'
            });

            if (result.code === 0) {
                return result.stdout
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && !line.startsWith('SCHEMA_NAME'))
                    .filter(lib => this.isValidLibraryName(lib));
            }

            throw new Error('Failed to retrieve library list');
        } catch (error: any) {
            console.error('Error fetching library list:', error);
            throw new Error(`Failed to retrieve library list: ${error.message}`);
        }
    }

    /**
     * Check if library name is valid and not a system library we should skip
     */
    private static isValidLibraryName(name: string): boolean {
        if (!name || name.length === 0) {
            return false;
        }

        // Skip common system libraries that users typically don't want to search
        const systemLibraries = [
            'QSYS', 'QSYS2', 'QSYS2_QUANTUM', 'QUSRSYS', 'QHLPSYS', 'QTEMP',
            'QRECOVERY', 'QDSNX', 'QBSC', 'QTCP', 'QRWI', 'QTMM', 'QPFRDATA'
        ];

        return !systemLibraries.includes(name.toUpperCase());
    }

    /**
     * Open a member using Code for IBM i's default opening logic
     */
    public static async openMemberAtLine(memberPath: string, lineNumber?: number): Promise<void> {
        const connection = this.getConnection();
        const config = connection?.getConfig();

        // Get default open mode from Code for IBM i plugin settings
        const defaultMode = config?.defaultOpenMode || 'edit'; // 'edit' or 'browse'

        try {
            // Always open full editor (no preview pane per requirements)
            if (defaultMode === 'browse') {
                await vscode.commands.executeCommand('code-for-ibmi.openWithDefaultMode', memberPath, 'browse');
            } else {
                await vscode.commands.executeCommand('code-for-ibmi.openEditable', memberPath);
            }

            // Navigate to specific line if provided
            if (lineNumber && lineNumber > 0) {
                // Wait a moment for editor to open
                setTimeout(async () => {
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        const position = new vscode.Position(lineNumber - 1, 0);
                        editor.selection = new vscode.Selection(position, position);
                        editor.revealRange(
                            new vscode.Range(position, position),
                            vscode.TextEditorRevealType.InCenter
                        );
                    }
                }, 100);
            }
        } catch (error: any) {
            console.error('Error opening member:', error);
            throw new Error(`Failed to open member: ${error.message}`);
        }
    }

    /**
     * Parse a QSYS member path into its components
     */
    public static parseMemberPath(path: string): {
        library: string;
        file: string;
        member: string;
        fullPath: string;
    } {
        // Expected format: /QSYS.LIB/LIBRARY.LIB/FILE.FILE/MEMBER.MBR
        const match = path.match(/\/QSYS\.LIB\/(.+)\.LIB\/(.+)\.FILE\/(.+)\.MBR/);
        
        if (!match) {
            throw new Error(`Invalid member path format: ${path}`);
        }

        const [, library, file, member] = match;
        
        return {
            library: library.toUpperCase(),
            file: file.toUpperCase(),
            member: member.toUpperCase(),
            fullPath: path
        };
    }

    /**
     * Build a QSYS member path from components
     */
    public static buildMemberPath(library: string, file: string, member: string): string {
        return `/QSYS.LIB/${library.toUpperCase()}.LIB/${file.toUpperCase()}.FILE/${member.toUpperCase()}.MBR`;
    }

    /**
     * Check if the current connection is active
     */
    public static isConnected(): boolean {
        const connection = this.getConnection();
        return connection !== undefined;
    }

    /**
     * Get connection name for display purposes
     */
    public static getConnectionName(): string {
        const connection = this.getConnection();
        return connection?.currentConnectionName || 'Unknown';
    }
}