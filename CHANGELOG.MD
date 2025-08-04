# Changelog

All notable changes to the "PFGREP Search for IBM i" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-15

### Added
- Initial release of PFGREP Search for IBM i extension
- Quick Search mode with sensible defaults (case insensitive, recursive)
- Advanced Search mode with full PFGREP option control
- Hierarchical results display (Library → File → Member → Lines)
- Multiple library selection methods:
  - All libraries wildcard search
  - Recent libraries quick selection
  - Browse libraries with tree view and multi-select
  - Custom patterns with wildcard support (PROD*, *TEST, LIB1,LIB2,LIB3)
- Search options support:
  - Case insensitive search (-i flag)
  - Fixed string vs regex search (-F flag)
  - Whole words matching (-w flag)
  - Recursive library search (-r flag)
  - Line number display (-n flag)
  - Maximum matches limiting (-m flag)
  - After context lines (-A flag)
  - Invert matches (-v flag)
  - Silent errors (-s flag)
  - Non-source files (-p flag)
- Results management:
  - Multiple simultaneous result windows (up to 5)
  - Sorting by name, hits, library, member
  - Export results to text files
  - Click to open members in default editor mode
  - Click lines to jump to specific line numbers
- Global settings persistence:
  - Recent libraries history
  - Recent search terms
  - Window size and position memory
  - Default search options
- Integration with Code for IBM i extension:
  - Automatic connection detection
  - PFGREP availability validation
  - Member opening using Code for IBM i commands
  - Respect default editor mode settings
- Keyboard shortcuts:
  - Ctrl+Alt+F (Cmd+Alt+F on Mac) to open search dialog
- Error handling with specific messages:
  - "PFGREP is not installed. Error" for missing PFGREP
  - "Don't have authority to that library" for permission issues
  - No fallback to regular grep (PFGREP-only approach)
- Search cancellation support
- Modal dialog interface (not webview)
- Tree view results with expand/collapse functionality

### Technical Features
- TypeScript implementation with strict typing
- Modular architecture with separation of concerns:
  - Core logic (connection, execution, settings)
  - UI components (modal, library browser, results)
  - Type definitions and interfaces
- Global state management (not workspace-dependent)
- Robust error handling and user feedback
- Memory-efficient result tree rendering
- Command building with proper shell escaping
- QSYS path parsing and validation

### Dependencies
- VS Code Engine: ^1.90.0
- Required: Code for IBM i extension (HalcyonTechLtd.code-for-ibmi)
- Required: PFGREP utility on IBM i system

### Known Limitations
- Maximum 5 simultaneous result windows
- No custom search presets (planned for future release)
- No source file granularity in library selection (library-level only)
- No live search (click-to-search only)
- Text export only (no CSV export)

---

## Planned Features (Future Releases)

### [1.1.0] - Planned
- Custom search presets creation and management
- Search history with replay functionality  
- Enhanced keyboard navigation in results
- Configurable result window limits
- Search progress indicators

### [1.2.0] - Planned
- Source file granularity in library selection
- CSV export format option
- Search result filtering and highlighting
- Batch search across multiple patterns
- Search performance analytics

### [1.3.0] - Planned
- Search scheduling and automation
- Integration with Code for IBM i's workspace features
- Advanced regex pattern builder
- Search result annotations and notes
- Team sharing of search configurations

---

## Migration Guide

### From Code for IBM i Built-in Search
This extension provides significant performance improvements over the built-in search:

1. **Speed**: PFGREP is optimized for IBM i physical files
2. **Features**: More search options and better result organization  
3. **UI**: Dedicated modal interface vs. integrated panels
4. **Results**: Hierarchical tree view with multiple sorting options

### Setup Steps
1. Install PFGREP on your IBM i: `yum install pfgrep`
2. Install this extension from VS Code Marketplace
3. Ensure Code for IBM i is connected
4. Use Ctrl+Alt+F to start your first search

---

## Support

For issues, feature requests, or contributions:
- File issues on the extension repository
- Check Code for IBM i documentation for connection issues
- Verify PFGREP installation on IBM i system
- Review troubleshooting section in README.md