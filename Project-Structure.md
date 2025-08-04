# PFGREP-IBMI Extension Project Structure

This document outlines the complete file structure and organization of the PFGREP Search for IBM i VS Code extension.

## 📁 Project Overview (Actual Created Files)

```
pfgrep-ibmi/
├── 📄 package.json                    # Extension manifest and configuration
├── 📄 tsconfig.json                   # TypeScript compilation settings
├── 📄 webpack.config.js               # Build configuration for production
├── 📄 README.md                       # Extension documentation
├── 📄 CHANGELOG.md                    # Version history and changes
├── 📄 .vscodeignore                   # Files to exclude from extension package
├── 📄 .gitignore                      # Git ignore patterns
├── 📄 LICENSE                         # MIT license file
├── 📄 PROJECT_STRUCTURE.md           # This file - project architecture
├── 📄 setup.sh                       # Linux/Mac setup script
├── 📄 setup.bat                      # Windows setup script
│
├── 📁 .vscode/                        # VS Code workspace configuration
│   ├── 📄 launch.json                 # Debug configurations
│   └── 📄 tasks.json                  # Build tasks
│
├── 📁 src/                            # Source code directory
│   ├── 📄 extension.ts                # Main extension entry point
│   │
│   ├── 📁 types/                      # TypeScript type definitions
│   │   └── 📄 interfaces.ts           # All interfaces and types
│   │
│   ├── 📁 core/                       # Core business logic
│   │   ├── 📄 connectionManager.ts    # IBM i connection handling
│   │   ├── 📄 pfgrepExecutor.ts       # PFGREP command execution
│   │   └── 📄 settingsManager.ts      # Settings persistence
│   │
│   └── 📁 ui/                         # User interface components
│       ├── 📄 searchModal.ts          # Search modal dialog
│       ├── 📄 libraryBrowser.ts       # Library selection UI
│       ├── 📄 resultsManager.ts       # Results management
│       └── 📄 resultsTreeProvider.ts  # Tree view provider
│
├── 📁 dist/                           # Compiled output (will be generated)
│   ├── 📄 extension.js                # Compiled main file
│   ├── 📄 extension.js.map            # Source map
│   └── 📁 **/*.js                     # All compiled TypeScript files
│
└── 📁 node_modules/                   # Dependencies (will be generated)
    └── ...
```

## 📋 Files You Need to Create Manually

The following files are referenced but need to be created manually (optional):

```
pfgrep-ibmi/
└── 🖼️ icon.png                        # Extension icon 128x128 (optional)
```

## 📋 File Descriptions

### Root Configuration Files

| File | Purpose | Key Content |
|------|---------|-------------|
| `package.json` | Extension manifest | Commands, keybindings, dependencies, metadata |
| `tsconfig.json` | TypeScript config | Compilation options, strict typing |
| `webpack.config.js` | Build configuration | Production bundling, source maps |
| `.vscodeignore` | Package exclusions | Development files to exclude |

### Documentation Files

| File | Purpose | Content |
|------|---------|---------|
| `README.md` | User documentation | Features, installation, usage guide |
| `CHANGELOG.md` | Version history | Release notes, migration guide |
| `PROJECT_STRUCTURE.md` | Architecture docs | This file - project organization |

### Source Code Organization

#### 📁 `src/types/` - Type Definitions
- `interfaces.ts` - All TypeScript interfaces and types
  - PFGREPOptions, SearchResults, SearchHit
  - Code for IBM i integration types
  - UI component interfaces

#### 📁 `src/core/` - Business Logic
- `connectionManager.ts` - IBM i connection handling
  - Connection validation
  - Library listing
  - Member opening integration
- `pfgrepExecutor.ts` - PFGREP command execution
  - Command building with options
  - Output parsing
  - Error handling with cancellation
- `settingsManager.ts` - Settings persistence
  - Global settings management
  - Recent libraries/searches
  - Window state persistence

#### 📁 `src/ui/` - User Interface
- `searchModal.ts` - Main search dialog
  - Quick vs Advanced search modes
  - Option collection and validation
- `libraryBrowser.ts` - Library selection
  - Tree view with multi-select
  - Wildcard pattern support
  - Recent library management
- `resultsManager.ts` - Results coordination
  - Multiple result window management
  - Export functionality
  - Search execution coordination
- `resultsTreeProvider.ts` - Tree view provider
  - Hierarchical result display
  - Sorting and filtering
  - Click handlers for navigation

### VS Code Configuration

#### 📁 `.vscode/` - Development Environment
- `launch.json` - Debug configurations for development
- `tasks.json` - Build tasks and scripts
- `settings.json` - Workspace-specific settings

## 🔧 Architecture Patterns

### Separation of Concerns

1. **Core Layer** (`src/core/`)
   - Business logic and data management
   - External service integration (IBM i, PFGREP)
   - No UI dependencies

2. **UI Layer** (`src/ui/`)
   - User interface components
   - Event handling and user interaction
   - Depends on core layer

3. **Types Layer** (`src/types/`)
   - Shared interfaces and type definitions
   - Contract definitions between layers
   - No implementation dependencies

### Dependency Flow

```
extension.ts (entry point)
    ↓
UI Components (searchModal, libraryBrowser, resultsManager)
    ↓
Core Services (connectionManager, pfgrepExecutor, settingsManager)
    ↓
VS Code API & Code for IBM i API
    ↓
IBM i System (PFGREP, DB2, File System)
```

### State Management

- **Global State**: Managed by SettingsManager using VS Code's globalState
- **Session State**: Managed by individual components (search results, UI state)
- **Connection State**: Delegated to Code for IBM i extension

## 🚀 Build Process

### Development Workflow

1. **Source Files** (`src/*.ts`) → **TypeScript Compiler** → **Compiled JS** (`dist/*.js`)
2. **Webpack** bundles for production → **Single extension.js** file
3. **VS Code Extension Host** loads the bundled extension

### Build Commands

| Command | Purpose | Output |
|---------|---------|--------|
| `npm run compile` | Development build | `dist/` folder with source maps |
| `npm run watch` | Watch mode | Continuous compilation |
| `vsce package` | Production package | `.vsix` file for distribution |

### Dependencies

#### Runtime Dependencies
- Code for IBM i extension (peer dependency)
- VS Code API (provided by host)

#### Development Dependencies
- TypeScript compiler
- Webpack and loaders
- VS Code extension tools

## 🔍 Key Integration Points

### Code for IBM i Extension

- **Connection API**: `api.instance.getConnection()`
- **File Opening**: `code-for-ibmi.openEditable`
- **Member Path Format**: `/QSYS.LIB/LIBRARY.LIB/FILE.FILE/MEMBER.MBR`

### PFGREP Utility

- **Command Format**: `pfgrep [options] pattern files`
- **Output Parsing**: `path:line:content` format
- **Error Handling**: Exit codes and stderr messages

### VS Code APIs

- **Commands**: Registration and execution
- **Tree Views**: Custom data providers
- **Quick Pick**: Modal dialogs and selection
- **File System**: Reading/writing result exports

## 📦 Distribution

### Package Contents

The final `.vsix` package includes:
- Compiled JavaScript files (`dist/`)
- Extension manifest (`package.json`)
- Documentation (`README.md`, `CHANGELOG.md`)
- Icon and assets
- Excludes development files (see `.vscodeignore`)

### Installation Methods

1. **VS Code Marketplace**: Published extension
2. **Manual Installation**: `.vsix` file via `code --install-extension`
3. **Development**: F5 debug launch in Extension Host

This architecture provides a clean, maintainable, and extensible foundation for the PFGREP Search extension while following VS Code extension best practices.

---

## 📦 Step-by-Step VSIX Creation Instructions

> **🚀 Quick Start**: Use the provided `setup.sh` (Linux/Mac) or `setup.bat` (Windows) scripts for automated setup, or follow the manual steps below.

### Prerequisites

1. **Node.js** (version 16 or higher)
   ```bash
   node --version  # Should be v16+ 
   npm --version   # Should be 8+
   ```

2. **Visual Studio Code Extension CLI (vsce)**
   ```bash
   npm install -g @vscode/vsce
   ```

3. **TypeScript** (if not already installed globally)
   ```bash
   npm install -g typescript
   ```

### Step 1: Set Up Project Directory

**Option A: Automated Setup (Recommended)**

1. Create the project folder and copy all artifacts:
   ```bash
   mkdir pfgrep-ibmi
   cd pfgrep-ibmi
   # Copy all provided files to their respective locations
   ```

2. Run the setup script:
   ```bash
   # Linux/Mac
   chmod +x setup.sh
   ./setup.sh
   
   # Windows
   setup.bat
   ```

3. The script will:
   - Check prerequisites
   - Install dependencies
   - Create directory structure
   - Compile TypeScript
   - Create VSIX package

**Option B: Manual Setup**

1. Create the project folder:
   ```bash
   mkdir pfgrep-ibmi
   cd pfgrep-ibmi
   ```

2. Create the directory structure:
   ```bash
   mkdir -p src/types src/core src/ui .vscode
   ```

3. Copy all the provided files into their respective locations according to the structure above.

### Step 2: Initialize and Install Dependencies

1. **Initialize npm** (package.json should already exist from artifacts):
   ```bash
   npm init -y  # Skip if package.json already copied
   ```

2. **Install TypeScript dependencies**:
   ```bash
   npm install --save-dev @types/vscode@^1.90.0 @types/node@16.x typescript@^4.9.4
   ```

3. **Install build dependencies**:
   ```bash
   npm install --save-dev webpack@^5.0.0 webpack-cli@^4.0.0 ts-loader@^9.0.0
   ```

### Step 3: Create Optional Files

1. **Create .gitignore** (optional but recommended):
   ```bash
   cat > .gitignore << EOL
   node_modules/
   dist/
   *.vsix
   .vscode-test/
   **/*.js.map
   **/*.js
   !webpack.config.js
   .DS_Store
   EOL
   ```

2. **Create LICENSE file** (optional):
   ```bash
   cat > LICENSE << EOL
   MIT License

   Copyright (c) 2024 Your Name

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.
   EOL
   ```

3. **Create extension icon** (optional but recommended):
   - Create a 128x128 PNG image named `icon.png` in the root directory
   - Or download a placeholder: 
   ```bash
   # Create a simple placeholder (requires ImageMagick)
   convert -size 128x128 xc:lightblue -gravity center -pointsize 24 -annotate +0+0 "PFGREP" icon.png
   ```

### Step 4: Build the Extension

1. **Compile TypeScript**:
   ```bash
   npm run compile
   ```
   Or manually:
   ```bash
   tsc -p ./
   ```

2. **Verify compilation** - check that `dist/` folder is created with compiled JS files.

### Step 5: Test the Extension (Optional but Recommended)

1. **Open in VS Code**:
   ```bash
   code .
   ```

2. **Run Extension in Debug Mode**:
   - Press `F5` or go to Run and Debug
   - Select "Run Extension"
   - This opens a new Extension Development Host window
   - Test your extension with `Ctrl+Alt+F`

### Step 6: Package the VSIX

1. **Validate the extension**:
   ```bash
   vsce ls
   ```
   This lists all files that will be included in the package.

2. **Create the VSIX package**:
   ```bash
   vsce package
   ```

   This creates a `.vsix` file like `pfgrep-ibmi-1.0.0.vsix`

3. **Alternative with specific name**:
   ```bash
   vsce package --out pfgrep-ibmi-extension.vsix
   ```

### Step 7: Install and Test VSIX

1. **Install the VSIX locally**:
   ```bash
   code --install-extension pfgrep-ibmi-1.0.0.vsix
   ```

2. **Or install via VS Code UI**:
   - Open VS Code
   - Press `Ctrl+Shift+P`
   - Type "Extensions: Install from VSIX"
   - Select your `.vsix` file

3. **Test the installed extension**:
   - Connect to IBM i using Code for IBM i
   - Press `Ctrl+Alt+F` to open PFGREP search
   - Verify all functionality works

### Step 8: Distribution Options

#### Option A: Local Distribution
- Share the `.vsix` file directly
- Users install with `code --install-extension yourfile.vsix`

#### Option B: VS Code Marketplace
1. **Create Azure DevOps account** (required for publishing)
2. **Get Personal Access Token**
3. **Publish to marketplace**:
   ```bash
   vsce publish
   ```

#### Option C: GitHub Releases
- Upload `.vsix` file to GitHub releases
- Users download and install manually

### Troubleshooting Common Issues

1. **"Cannot find module" errors**:
   ```bash
   npm install
   npm run compile
   ```

2. **VSCE not found**:
   ```bash
   npm install -g @vscode/vsce
   ```

3. **TypeScript compilation errors**:
   - Check `tsconfig.json` settings
   - Ensure all imports are correct
   - Run `tsc --noEmit` to check for errors

4. **Large package size**:
   - Check `.vscodeignore` file
   - Remove unnecessary files
   - Use `vsce ls` to see what's included

5. **Extension doesn't activate**:
   - Check `package.json` activation events
   - Verify command registration
   - Check browser console for errors (F12 in Extension Host)

### Final Verification Checklist

Before distributing your VSIX:

- [ ] Extension activates successfully
- [ ] All commands work as expected
- [ ] PFGREP search executes without errors
- [ ] Results display correctly
- [ ] Export functionality works
- [ ] No console errors in Extension Host
- [ ] Extension uninstalls cleanly
- [ ] File size is reasonable (< 10MB typically)

Your VSIX file is now ready for distribution! 🎉