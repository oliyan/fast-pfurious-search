# Fast & PF-urious Search for IBM i

A lightning-fast VS Code extension that brings the power of PFGREP to your IBM i source code searches. Search millions of lines across hundreds of libraries in seconds.

## Installation

### Prerequisites
1. **Code for IBM i Extension**: Must be installed and connected to your IBM i system
2. **PFGREP Utility**: Must be installed on your IBM i system

### Install PFGREP on IBM i
Connect to your IBM i terminal and run:
```sh
wget https://github.com/SeidenGroup/pfgrep/releases/download/v0.5.1/pfgrep-0.5.1-0seiden.ibmi7.2.ppc64.rpm && yum install pfgrep-0.5.1-0seiden.ibmi7.2.ppc64.rpm
```

Verify installation: `which pfgrep`

### Install Extension
1. Install "Fast & PF-urious Search" from VS Code Marketplace
2. Ensure Code for IBM i extension is connected
3. Press `Ctrl+Alt+F` to start searching!

## Quick Start

1. **Open Search**: Press `Ctrl+Alt+F` (or `Cmd+Alt+F` on Mac)
2. **Enter Search Term**: Type what you're looking for
3. **Specify Libraries**: Enter comma-separated library names (e.g., `MYLIB,PROD*,*TEST`)
4. **Search**: Press Enter or click the Search button
5. **Navigate Results**: Click members to open, click lines to jump to specific locations

## Features

- **⚡ Lightning Fast**: Search millions of lines in seconds using native PFGREP
- **🎯 Smart Library Selection**: Use wildcards and patterns (`PROD*`, `*TEST`) 
- **🔍 Flexible Search**: Case-insensitive, whole words, regex patterns, and more
- **📊 Organized Results**: Hierarchical tree view with member grouping
- **💾 Smart Memory**: Remembers recent searches and libraries
- **🚀 Seamless Integration**: Works perfectly with Code for IBM i extension
- **📁 Multiple Results**: Keep multiple search result windows open
- **💾 Export Results**: Save search results to text files

## Basic Configuration

Add these settings to your VS Code settings:

```json
{
    "pfgrep-ibmi.defaultLibraries": "MYLIB,PROD*,*DEV",
    "pfgrep-ibmi.maxRecentSearches": 10,
    "pfgrep-ibmi.maxResultWindows": 5
}
```

## Search Options

### Search Modes

**Normal Search (Default)**
- Searches for exact text matches
- Multi-word searches are automatically wrapped in quotes
- Use manual quotes for exact phrases: `"EXEC SQL"`
- Case-insensitive by default

**Smart-search (REGEX) Mode**
- Enable regex pattern matching
- Use patterns like `\bCVTDT\b` for whole words
- Use `^START` for lines starting with text
- Use `.*` for wildcards

### Options
- **Case Sensitive**: When checked, matches exact case. Default is OFF (case-insensitive)
- **Smart-search (REGEX)**: Enable regex patterns. Default is OFF (normal text search)
- **Show Context Lines**: Display N lines after each match (0-50). Helpful for understanding code context

### Library Patterns
```
MYLIB                    # Single library
MYLIB,YOURLIB           # Multiple specific libraries
PROD*                   # All libraries starting with PROD
*TEST                   # All libraries ending with TEST
PROD*,*TEST,MYLIB       # Combination of patterns
```

### Search Limits
- Maximum matches per search: **5000 lines**
- You'll receive a warning if this limit is reached

## Comparison with Other Tools

| Feature | Fast & PF-urious Search | Built-in VS Code Search | IBM i RDi |
|---------|------------------------|------------------------|-----------|
| **Speed** | ⚡ Ultra-fast | 🐌 Slow over network | 🐌 Slow |
| **IBM i Native** | ✅ Native PFGREP | ❌ Generic search | ✅ Native |
| **Modern UI** | ✅ VS Code integration | ✅ VS Code | ❌ Eclipse |
| **Free** | ✅ Open source | ✅ Built-in | ❌ Licensed |

## Troubleshooting

### PFGREP Not Found Error

If you get "PFGREP is not installed" error:

1. **Connect to IBM i terminal**
2. **Install PFGREP**: 
   ```sh
   wget https://github.com/SeidenGroup/pfgrep/releases/download/v0.5.1/pfgrep-0.5.1-0seiden.ibmi7.2.ppc64.rpm && yum install pfgrep-0.5.1-0seiden.ibmi7.2.ppc64.rpm
   ```
3. **Verify installation**: `which pfgrep`
4. **Restart VS Code** and try again

### Other Common Issues
- **Connection Issues**: Ensure Code for IBM i extension is connected
- **Library Access**: Check that you have proper authority to the libraries you're searching
- **Member Not Opening**: Verify the member still exists and you have read access

## Support

- **Issues & Feature Requests**: [File on GitHub repository]
- **Connection Problems**: Check Code for IBM i documentation
- **General Help**: Review this README or extension documentation

---

## Usage Examples

### Normal Search Examples
```
SQL                     # Find "SQL" (case-insensitive)
EXEC SQL               # Auto-wrapped as "EXEC SQL" for exact phrase
"fixed   spaces"       # Preserve exact spacing
CVTDT                  # Simple text search
```

### Regex Search Examples
```
^DCL-                  # Lines starting with DCL-
\bCVTDT\b             # Whole word CVTDT only
EXEC\s+SQL            # EXEC followed by SQL with any whitespace
(SELECT|INSERT|UPDATE) # Match any of these SQL keywords
```

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
1. Clone the repository
2. Run `npm install`
3. Open in VS Code and press F5 to debug

## 📝 License

This project is licensed under the GPL v3 License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Code for IBM i Team**: For the excellent foundational extension
- **Seiden Group**: For porting the awesome GREP tool to IBMi
- **IBM i Community**: For continuous feedback and support

---

**Happy Searching!** 🔍✨

*Bring the power of IBM i's fastest search utility directly into your VS Code workflow.*
