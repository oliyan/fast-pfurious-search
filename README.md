# PFGREP Search for IBM i

A powerful VS Code extension that provides fast searching of IBM i physical file members using the PFGREP utility. This extension integrates seamlessly with the [Code for IBM i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi) extension to deliver superior search performance for IBM i developers.

## ✨ Features

- **🚀 Fast Search**: Leverages PFGREP for high-performance searching of physical file members
- **🎯 Smart Library Selection**: Browse and select libraries with tree view and multi-select
- **🔧 Advanced Options**: Full access to PFGREP's powerful search capabilities
- **📊 Hierarchical Results**: Organized results by Library → File → Member → Lines
- **⚡ Quick Search**: Simple mode with sensible defaults for everyday searches
- **🔄 Multiple Windows**: Support for multiple simultaneous search result windows
- **📁 Export Results**: Export search results to text files for documentation
- **🎨 Intuitive UI**: Clean, modal-based interface with keyboard shortcuts

## 📋 Requirements

- **[Code for IBM i](https://marketplace.visualstudio.com/items?itemName=HalcyonTechLtd.code-for-ibmi)** extension installed and connected
- **PFGREP** utility installed on your IBM i system
- Active IBM i connection through Code for IBM i

### Installing PFGREP

If PFGREP is not installed on your IBM i system, install it using:

```bash
yum install pfgrep
```

Or download from the [official repository](https://github.com/SeidenGroup/pfgrep).

## 🚀 Getting Started

### Basic Usage

1. **Open Search**: Press `Ctrl+Alt+F` (or `Cmd+Alt+F` on Mac) to open the search dialog
2. **Select Mode**: Choose "Quick Search" for simple searches or "Advanced Search" for full control
3. **Enter Search Term**: Type what you're looking for
4. **Select Libraries**: Choose which libraries to search in
5. **Configure Options**: Set search parameters (case sensitivity, whole words, etc.)
6. **Search**: Click "Search" to execute

### Quick Search Mode

Perfect for everyday searches with sensible defaults:
- Case insensitive search enabled
- Recursive search through libraries
- Simple option selection
- Ideal for most use cases

### Advanced Search Mode

Full control over PFGREP options:
- All PFGREP flags available
- Maximum matches limiting
- After context lines
- Invert matches
- Non-source file searching
- Custom line number display

## 🎯 Search Features

### Library Selection

Multiple ways to select libraries:
- **All Libraries**: Search across all accessible libraries
- **Recent Libraries**: Quick selection from previously used libraries
- **Browse Libraries**: Tree view with search and multi-select
- **Custom Patterns**: Support for wildcards and comma-separated lists

#### Wildcard Examples:
- `PROD*` - All libraries starting with "PROD"
- `*TEST` - All libraries ending with "TEST"
- `LIB1,LIB2,LIB3` - Specific libraries
- `PROD*,*DEV` - Multiple patterns

### Search Options

#### Quick Search Options:
- **Case Insensitive** (`-i`): Ignore case differences
- **Fixed String** (`-F`): Search for exact string (not regex)
- **Whole Words** (`-w`): Match complete words only
- **Recursive** (`-r`): Search recursively through libraries

#### Advanced Options:
- **Line Numbers** (`-n`): Show line numbers in results
- **Max Matches** (`-m`): Limit number of matches
- **After Context** (`-A`): Show lines after each match
- **Invert Matches** (`-v`): Show non-matching lines
- **Silent Errors** (`-s`): Suppress error messages
- **Non-Source Files** (`-p`): Search non-source physical files

## 📊 Results Management

### Results Display

Results are organized hierarchically:
```
📁 Library (12 hits)
├── 📁 Source File (10 hits)
│   ├── 📄 Member1 (4 hits)
│   │   ├── 📍 Line 156: code content
│   │   └── 📍 Line 234: more content
│   └── 📄 Member2 (6 hits)
└── 📁 Another File (2 hits)
```

### Sorting Options

Sort results by:
- **Name**: Alphabetical order (A-Z, Z-A)
- **Hits**: Number of matches (High-Low, Low-High)
- **Library**: Library name order
- **Member**: Member name order

### Actions

- **Click Member**: Open member in editor (uses default mode from Code for IBM i settings)
- **Click Line**: Open member at specific line with cursor positioned
- **Export Results**: Save search results to text file
- **Multiple Windows**: Keep multiple search results open simultaneously

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Alt+F` | Open PFGREP search dialog |
| `Escape` | Cancel current operation |

## ⚙️ Configuration

The extension stores settings globally (not per workspace):

### Default Settings

```json
{
  "pfgrep-ibmi.defaultOptions": {
    "caseInsensitive": true,
    "recursive": true,
    "wholeWords": false,
    "fixedString": false
  },
  "pfgrep-ibmi.maxRecentSearches": 10,
  "pfgrep-ibmi.maxResultWindows": 5
}
```

### Settings Details

- **Recent Libraries**: Automatically maintained list of recently used libraries
- **Default Options**: Your preferred search option defaults
- **Window Size/Position**: Modal window size and position (automatically saved)
- **Max Recent Searches**: Number of search terms to remember
- **Max Result Windows**: Maximum simultaneous result windows

## 🔧 Advanced Usage

### Search Patterns

PFGREP supports PCRE2 regular expressions when not using Fixed String mode:

```regex
^dcl-pr\s+\w+      # Procedure declarations
\b[A-Z]{3}\d{3}\b   # Three letters followed by three digits
(error|fail|exception) # Multiple terms
```

### Wildcard Library Selection

Efficient library selection using patterns:
- `PROD*,DEV*,TEST*` - All production, development, and test libraries
- `*SRC` - All source libraries
- `QRP*` - All libraries starting with QRP

### Export Formats

Exported results include:
- Search parameters used
- Library/file structure
- Line numbers and content
- Timestamp and summary statistics

## 🔍 Troubleshooting

### Common Issues

**"PFGREP is not installed. Error"**
- Install PFGREP: `yum install pfgrep`
- Verify installation: `which pfgrep`

**"Don't have authority to that library"**
- Check your user profile authorities
- Contact system administrator for library access

**"No IBM i connection found"**
- Install and configure Code for IBM i extension
- Establish connection to IBM i system

**Search is slow**
- Reduce library scope
- Use more specific search terms
- Consider using Fixed String mode for literal searches

### Performance Tips

- Use specific library patterns instead of searching all libraries
- Enable Fixed String mode for literal searches (faster than regex)
- Use Whole Words option to reduce false matches
- Limit Max Matches for very common terms

## 📚 PFGREP Documentation

For complete PFGREP documentation, see the [official repository](https://github.com/SeidenGroup/pfgrep).

### Useful PFGREP Options

| Flag | Description | Use Case |
|------|-------------|----------|
| `-i` | Case insensitive | Finding variables regardless of case |
| `-w` | Whole words | Avoiding partial matches |
| `-F` | Fixed string | Literal text search (faster) |
| `-r` | Recursive | Search through entire libraries |
| `-A 3` | After context | Show 3 lines after each match |
| `-m 100` | Max matches | Limit results for common terms |

## 🤝 Contributing

This extension integrates with the broader IBM i development ecosystem. For related projects:

- [Code for IBM i](https://github.com/codefori/vscode-ibmi) - Main IBM i extension
- [PFGREP](https://github.com/SeidenGroup/pfgrep) - Search utility

## 📝 License

MIT License - see LICENSE file for details.

## 🙏 Credits

- **PFGREP**: Created by Seiden Group
- **Code for IBM i**: Created by the Code for IBM i community
- **Extension**: Built for the IBM i developer community

---

**Enjoy faster, more powerful searching on IBM i!** 🚀