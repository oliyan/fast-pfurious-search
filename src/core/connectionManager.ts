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
     * Open a member using Code for IBM i's proven commands (automatic CCSID + source type detection)
     */
    public static async openMemberAtLine(memberPath: string, lineNumber?: number): Promise<void> {
        try {
            console.log(`Opening member: ${memberPath}${lineNumber ? ` at line ${lineNumber}` : ''}`);

            // Parse the QSYS path to get components
            const pathParts = this.parseMemberPath(memberPath);
            console.log('Parsed path parts:', pathParts);

            // Get the connection to query member info
            const connection = this.getConnection();
            if (!connection) {
                throw new Error('No IBM i connection available');
            }

            // Query the actual member info to get the real source type
            // This is exactly what Code for IBM i does internally
            try {
                console.log('Querying member info for source type...');
                
                const memberInfo = await connection.getContent().getMemberInfo(
                    pathParts.library, 
                    pathParts.file, 
                    pathParts.member
                );

                console.log('Member info result:', memberInfo);

                if (memberInfo) {
                    // Use the real source type from the system, not guessed from file name
                    const realSourceType = memberInfo.extension || 'MBR';
                    const correctPath = `${pathParts.library}/${pathParts.file}/${pathParts.member}.${realSourceType}`;
                    
                    console.log('Using correct path with real source type:', correctPath);

                    // Open with the correct source type - this should give proper syntax highlighting
                    await vscode.commands.executeCommand(
                        'code-for-ibmi.openWithDefaultMode',
                        { path: correctPath },
                        undefined // Edit mode
                    );

                    console.log('✅ Successfully opened member with correct source type');

                } else {
                    // Fallback: if member info query fails, use simple path without extension
                    console.log('Member info not found, using simple path fallback');
                    const simplePath = `${pathParts.library}/${pathParts.file}/${pathParts.member}`;
                    
                    await vscode.commands.executeCommand(
                        'code-for-ibmi.openWithDefaultMode',
                        { path: simplePath },
                        undefined
                    );

                    console.log('✅ Opened with simple path fallback');
                }

            } catch (memberInfoError: any) {
                console.log('Member info query failed, trying simple path:', memberInfoError.message);
                
                // Fallback: use simple path without extension
                const simplePath = `${pathParts.library}/${pathParts.file}/${pathParts.member}`;
                
                await vscode.commands.executeCommand(
                    'code-for-ibmi.openWithDefaultMode',
                    { path: simplePath },
                    undefined
                );

                console.log('✅ Opened with simple path after member info failure');
            }

            // Navigate to specific line if provided
            if (lineNumber && lineNumber > 0) {
                // Wait for the editor to be ready and content to load
                this.navigateToLineWhenReady(pathParts, lineNumber);
            }

        } catch (error: any) {
            console.error('Error opening member:', error);
            
            // Final fallback: try browse command with simple path
            try {
                console.log('Trying final fallback with browse command...');
                const pathParts = this.parseMemberPath(memberPath);
                const simplePath = `${pathParts.library}/${pathParts.file}/${pathParts.member}`;
                
                await vscode.commands.executeCommand('code-for-ibmi.browse', { path: simplePath });
                console.log('✅ Final fallback succeeded');
                
                if (lineNumber && lineNumber > 0) {
                    this.navigateToLineWhenReady(pathParts, lineNumber);
                }
                
            } catch (fallbackError: any) {
                console.error('All fallback attempts failed:', fallbackError);
                throw new Error(`Failed to open member: ${error.message}. Fallback: ${fallbackError.message}`);
            }
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

    /**
     * Smart navigation that waits for the editor to be properly loaded
     */
    private static async navigateToLineWhenReady(pathParts: any, lineNumber: number): Promise<void> {
        const memberName = pathParts.member.toUpperCase();
        const maxAttempts = 10; // Try for up to 15 seconds (10 * 1500ms)
        let attempts = 0;

        console.log(`Attempting to navigate to line ${lineNumber} in member ${memberName}`);

        const tryNavigate = () => {
            attempts++;
            console.log(`Navigation attempt ${attempts}/${maxAttempts}`);

            const editor = vscode.window.activeTextEditor;
            
            if (editor && editor.document) {
                // Check if this is the right document by checking if the member name appears in the path
                const editorPath = editor.document.uri.path.toUpperCase();
                const memberInPath = editorPath.includes(memberName);
                
                console.log(`Editor found: ${editor.document.uri.toString()}`);
                console.log(`Member name in path: ${memberInPath}`);
                console.log(`Document line count: ${editor.document.lineCount}`);
                
                // Check if the document is properly loaded (has content and not just loading)
                if (memberInPath && editor.document.lineCount > 1) {
                    try {
                        const targetLine = Math.max(0, Math.min(lineNumber - 1, editor.document.lineCount - 1));
                        const position = new vscode.Position(targetLine, 0);
                        
                        // Set selection and reveal
                        editor.selection = new vscode.Selection(position, position);
                        editor.revealRange(
                            new vscode.Range(position, position),
                            vscode.TextEditorRevealType.InCenter
                        );
                        
                        console.log(`✅ Successfully navigated to line ${lineNumber} (editor line ${targetLine + 1})`);
                        return; // Success!
                        
                    } catch (navError: any) {
                        console.error(`Error during navigation attempt ${attempts}:`, navError);
                    }
                } else {
                    console.log(`Editor not ready yet - member in path: ${memberInPath}, line count: ${editor.document.lineCount}`);
                }
            } else {
                console.log('No active editor found yet');
            }

            // If we haven't succeeded and haven't exceeded max attempts, try again
            if (attempts < maxAttempts) {
                setTimeout(tryNavigate, 1500); // Wait 1500ms before next attempt
            } else {
                console.log(`❌ Failed to navigate to line ${lineNumber} after ${maxAttempts} attempts`);
            }
        };

        // Check if the member is already open first
        const existingEditor = vscode.window.visibleTextEditors.find(editor => 
            editor.document.uri.path.toUpperCase().includes(memberName)
        );

        if (existingEditor && existingEditor.document.lineCount > 1) {
            // Member is already open and loaded, navigate immediately
            console.log('Member already open, navigating immediately');
            try {
                const targetLine = Math.max(0, Math.min(lineNumber - 1, existingEditor.document.lineCount - 1));
                const position = new vscode.Position(targetLine, 0);
                
                // Focus the editor first
                await vscode.window.showTextDocument(existingEditor.document, {
                    selection: new vscode.Range(position, position),
                    viewColumn: existingEditor.viewColumn
                });
                
                console.log(`✅ Immediately navigated to line ${lineNumber} in already-open member`);
                
            } catch (immediateNavError: any) {
                console.error('Error in immediate navigation:', immediateNavError);
                // Fall back to the retry method
                setTimeout(tryNavigate, 100);
            }
        } else {
            // Member is not open or not loaded yet, start the retry process
            console.log('Member not open yet, starting retry process');
            setTimeout(tryNavigate, 750); // Give a bit more time for initial load
        }
    }
}