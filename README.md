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

### Basic Options
- **Case Insensitive**: Ignore case when matching (enabled by default)
- **Fixed String**: Treat search term as literal text, not regex
- **Whole Words**: Match complete words only
- **Show Line Numbers**: Include line numbers in results

### Library Patterns
```
MYLIB                    # Single library
MYLIB,YOURLIB           # Multiple specific libraries  
PROD*                   # All libraries starting with PROD
*TEST                   # All libraries ending with TEST
PROD*,*TEST,MYLIB       # Combination of patterns
```

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

## Advanced Configuration (Under Review)

> **Note**: These advanced options are under review and may be removed or modified in future versions.

### Advanced Search Options

| Option | Description | Default |
|--------|-------------|---------|
| **Invert Matches** | Find lines that DON'T contain the search term | ❌ Disabled |
| **Silent Errors** | Suppress error messages during search | ❌ Disabled |
| **Non-Source Files** | Include non-source physical files | ❌ Disabled |
| **Don't Trim Whitespace** | Preserve leading/trailing spaces | ❌ Disabled |
| **Max Matches** | Limit the number of results returned | No limit |
| **After Context Lines** | Show N lines after each match | 0 |

### Advanced Settings

```json
{
    "pfgrep-ibmi.enableSilentErrors": false,
    "pfgrep-ibmi.includeNonSourceFiles": false,
    "pfgrep-ibmi.preserveWhitespace": false,
    "pfgrep-ibmi.defaultMaxMatches": 0,
    "pfgrep-ibmi.defaultAfterContext": 0,
    "pfgrep-ibmi.enableInvertMatch": false
}
```

### Advanced Usage Examples

#### Complex Search Patterns (Regex)
```
^DCL-                   # Lines starting with DCL-
\bCVTDT\b              # Whole word CVTDT
EXEC\s+SQL             # EXEC followed by SQL with variable whitespace
```

#### Advanced Library Selection
```
MYLIB*,!MYLIBTEST      # All MYLIB* libraries except MYLIBTEST
*PROD,*TEST,MYDEV      # Multiple pattern combinations
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
