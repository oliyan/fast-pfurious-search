# Fast & PFurious search
> Fueled by PFGREP

Built to work seamlessly with Code for IBM i, this extension brings blazing-fast IBM i source code search directly into your development environment. Built on top of the ultra-fast PFGREP utility (thanks to [seiden group](https://github.com/SeidenGroup)), this extension provides lightning-quick search capabilities across IBM i libraries with an intuitive, modern interface.

The name "Fast & PF-urious" isn't just a cheeky nod to the [Fast and Furious](https://en.wikipedia.org/wiki/Fast_%26_Furious) franchise; it perfectly captures that adrenaline rush when you're blazing through thousands of source members with surgical precision. The "PF" represents Physical Files (because that's what we're actually searching), while the "urious" part captures that satisfying moment when technology finally works the way it should have from day one. Because life's too short for slow searches, and hitting 25 + Shift F1 on PDM won't just cut it. 

## ✨ Features

### 🚀 **Lightning-Fast Search**
- **PFGREP Integration**: Harnesses the speed of IBM i's PFGREP utility for near-instantaneous search results
- **Single-Click Search**: One modal window with all search options - no more multi-step wizards
- **Real-time Results**: Results appear as fast as PFGREP can deliver them

### 🎯 **Intelligent Search Interface**
- **Unified Search Modal**: All search options available in one clean, VS Code-themed interface
- **Simplified Library Input**: Comma-separated library names with wildcard support (`LIB1,LIB2,PROD*,*DEV`)
- **Smart Defaults**: Remembers your last used libraries and search terms
- **Recent Search Terms**: Quick-select from your recent searches

### 📁 **Hierarchical Results Display**
- **Auto-Expanding Tree**: Results organized by Library → Source File → Member → Lines
- **Instant Navigation**: Click any member to open with proper syntax highlighting
- **Line-Level Precision**: Click specific line numbers to jump directly to matches
- **Hit Counts**: See exactly how many matches in each library, file, and member

### 🔧 **Advanced Search Options**
- **Case Insensitive Search** (default: enabled)
- **Fixed String vs Regex** patterns
- **Whole Words** matching
- **Recursive Library** search (default: enabled)
- **Line Numbers** display
- **Maximum Matches** limiting
- **Context Lines** (show lines after matches)
- **Invert Matches** (find lines that DON'T match)

### 🎨 **Perfect Code Integration**
- **Real Source Type Detection**: Queries actual member source types for proper syntax highlighting
- **Smart Member Opening**: Works with any source file type (QRPGLESRC, QCLLESRC, generic files like QBACKUP)
- **Language Mode Detection**: Automatically detects RPGLE, CLLE, SQLRPGLE, COBOL, SQL, etc.

### ⚙️ **Flexible Configuration**
- **Default Libraries**: Set your most-used libraries in VS Code settings
- **Search History**: Automatic persistence of recent searches and libraries
- **Multiple Result Windows**: Keep multiple search results open simultaneously
- **Export Results**: Save search results to text files

## 🚀 Quick Start

### Prerequisites
1. **Code for IBM i Extension**: This extension requires the Code for IBM i extension to be installed and connected
2. **PFGREP Utility**: Must be installed on your IBM i system (`/QOpenSys/pkgs/bin/pfgrep`)

### Installation
1. Install from VS Code Marketplace
2. Ensure you're connected to IBM i via Code for IBM i extension
3. Press `Ctrl+Alt+F` (or `Cmd+Alt+F` on Mac) to start searching!

### Basic Usage
1. **Open Search**: Press `Ctrl+Alt+F`
2. **Enter Search Term**: Type what you're looking for
3. **Specify Libraries**: Enter comma-separated library names (e.g., `MYLIB,PROD*,*TEST`)
4. **Customize Options**: Toggle search options as needed
5. **Search**: Press Enter or click the Search button
6. **Navigate Results**: Click members to open, click lines to jump to specific locations

## 📋 Search Options Reference

### Basic Options
| Option | Description | Default |
|--------|-------------|---------|
| **Case Insensitive** | Ignore case when matching | ✅ Enabled |
| **Fixed String** | Treat search term as literal text (not regex) | ❌ Disabled |
| **Whole Words** | Match complete words only | ❌ Disabled |
| **Recursive** | Search all libraries in the list | ✅ Enabled |

### Advanced Options
| Option | Description | Default |
|--------|-------------|---------|
| **Show Line Numbers** | Include line numbers in results | ❌ Disabled |
| **Invert Matches** | Find lines that DON'T contain the search term | ❌ Disabled |
| **Silent Errors** | Suppress error messages during search | ❌ Disabled |
| **Non-Source Files** | Include non-source physical files | ❌ Disabled |
| **Don't Trim Whitespace** | Preserve leading/trailing spaces | ❌ Disabled |
| **Max Matches** | Limit the number of results returned | No limit |
| **After Context Lines** | Show N lines after each match | 0 |

## ⚙️ Configuration

### Extension Settings

Add these settings to your VS Code configuration:

```json
{
    "pfgrep-ibmi.defaultLibraries": "MYLIB,PROD*,*DEV",
    "pfgrep-ibmi.maxRecentSearches": 10,
    "pfgrep-ibmi.maxResultWindows": 5
}
```

### Settings Reference
| Setting | Description | Default |
|---------|-------------|---------|
| `pfgrep-ibmi.defaultLibraries` | Comma-separated list of default libraries to search | `""` |
| `pfgrep-ibmi.maxRecentSearches` | Maximum number of recent search terms to remember | `10` |
| `pfgrep-ibmi.maxResultWindows` | Maximum number of simultaneous result windows | `5` |

## 🖱️ Usage Examples

### Library Patterns
```
MYLIB                    # Single library
MYLIB,YOURLIB           # Multiple specific libraries  
PROD*                   # All libraries starting with PROD
*TEST                   # All libraries ending with TEST
PROD*,*TEST,MYLIB       # Combination of patterns
```

### Search Patterns
```
dsply                   # Simple text search
'Hello World'           # Phrase with spaces
EXEC SQL                # SQL statements
^DCL-                   # Lines starting with DCL- (regex)
\bCVTDT\b              # Whole word CVTDT (regex)
```

## 🌟 Key Benefits

### **Speed**
- **Instant Results**: PFGREP searches millions of lines in seconds
- **No Indexing Required**: Search immediately without waiting for indexes
- **Minimal Network Traffic**: Efficient search execution on IBM i

### **Accuracy** 
- **Real Source Type Detection**: Proper syntax highlighting for all member types
- **Precise Line Navigation**: Jump directly to the exact line of interest

### **Usability**
- **Single-Window Workflow**: Everything accessible from one modal
- **Smart Memory**: Remembers your preferences and recent searches  
- **Visual Organization**: Clear hierarchical display of results
- **Seamless Integration**: Works perfectly with Code for IBM i ecosystem

## 🔧 Troubleshooting

### PFGREP Not Found
If you get "PFGREP is not installed" error:

1. Connect to IBM i terminal
2. Install PFGREP.
   You can either,
   1. Follow [this link](https://github.com/SeidenGroup/pfgrep?tab=readme-ov-file#installation) to install pfgrep first. 
   
   <br> 

   or
   
   <br> 

   2. Run this in your IBM i terminal
   ```sh
   wget https://github.com/SeidenGroup/pfgrep/releases/download/v0.5.1/pfgrep-0.5.1-0seiden.ibmi7.2.ppc64.rpm && yum install pfgrep-0.5.1-0seiden.ibmi7.2.ppc64.rpm
   ```

3. Verify installation: `which pfgrep`

### Connection Issues
- Ensure Code for IBM i extension is connected
- Check that you have proper authority to the libraries you're searching
- Verify PFGREP has appropriate permissions

### Search Results Not Opening
- Verify Code for IBM i connection is active
- Check that the member still exists in the source file
- Ensure you have read access to the member

## 🆚 Comparison with Other Tools

| Feature | Fast & PF-urious search | Built-in VS Code Search | IBM i RDi |
|---------|--------------|------------------------|-----------|
| **Speed** | ⚡ Ultra-fast | 🐌 Slow over network | 🐌 Slow |
| **IBM i Native** | ✅ Native PFGREP | ❌ Generic search | ✅ Native |
| **Source Type Detection** | ✅ Automatic | ❌ Manual | ✅ Good |
| **Modern UI** | ✅ VS Code integration | ✅ VS Code | ❌ Eclipse |
| **Free** | ✅ Open source | ✅ Built-in | ❌ Licensed |

## 🎯 Tips for Best Results

### **Library Organization**
- Use wildcard patterns to search related libraries efficiently
- Set frequently-used libraries as defaults in settings
- Use descriptive library naming conventions for better wildcard matching

### **Search Strategies** 
- Start with broad searches, then narrow down with specific terms
- Use case-insensitive search for initial exploration
- Enable "Whole Words" when searching for specific procedure names
- Use regex patterns for complex matching scenarios

### **Performance Optimization**
- Limit searches to relevant libraries rather than searching all libraries
- Use "Max Matches" to limit results for very common terms
- Consider using "Fixed String" for literal text searches (faster than regex)

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
