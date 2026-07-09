# Changelog

All notable changes to the "PFGREP Search for IBM i" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-07-09

### 🔄 Search & Replace — Mass Source Member Updates

### Added
- **Search & Replace mode** — Toggle the replace field in the search dialog to enable replace alongside search
- **Dry-run preview window** — All matches shown in a Library → Source File → Member → Line tree before any writes occur
- **Granular occurrence selection** — Per-line checkboxes let you include or exclude individual occurrences before confirming
- **Truncation risk detection** — Lines where the replacement is longer than the original are flagged with ⚠ (80-char SRCDTA field limit)
- **Delete mode** — Leave the replace field empty to delete all matched occurrences; requires an explicit acknowledgement checkbox before proceeding
- **Live streaming results** — Status icons update per member in real-time as replacements are written (✅ replaced, ⚠✅ replaced with truncation risk, 🔄 skipped, ❌ failed)
- **Authority error handling** — Distinct error status for members where the user lacks `*CHANGE` authority
- **Replace summary** — Final count of replaced / skipped / failed occurrences on completion
- **Member type display** — Replace preview window now shows `MEMBERNAME.sourcetype` (e.g. `BACKITUP.rpgle`) using a live SQL query
- **Syntax-highlighted member open** — Clicking a search result in the tree view now opens the member with its correct source type, enabling syntax highlighting in VS Code

### Technical Changes
- Added `src/core/memberReplacer.ts` — Replace engine using SQL ALIASes scoped to QTEMP for correct per-member read/write access (V7.3 compatible; uses DROP + CREATE pattern since `CREATE OR REPLACE ALIAS` requires V7.4)
- Added `src/ui/replaceWindow.ts` — WebviewPanel for the preview tree and live results UI
- SQL ALIAS pattern: `CREATE ALIAS QTEMP.PFAxxxxxxx FOR library.file(member)` avoids job-context issues and correctly scopes member access for both SELECT and UPDATE
- Unique alias names via static counter (`PFA0000001`, `PFA0000002`, ...) prevent collisions when up to 5 members are processed in parallel
- Parameterized `UPDATE` using `?` binding avoids SQL string-splitting on semicolons present in source content
- `QSYS2.SYSPARTITIONSTAT` used for member source-type lookup — works without `getMemberInfo()` which is absent on older Code for IBM i versions
- Added `ReplaceRequest`, `OccurrenceSelection`, `OccurrenceResult`, `ReplaceResult` interfaces to `src/types/interfaces.ts`
- Added `runSQL()` to the `IBMiConnection` interface to expose parameterized query support

---

## [1.1.1] - 2025-01-11

### 🎯 Major UX Refinements - Tab-Based Search & Granular Location Support

### Added
- **Tabbed search mode interface** - Clean "Basic Search" and "REGEX Search" tabs instead of checkbox
- **Search Location granularity** - Support for LIB/FILE/MEMBER patterns (e.g., `MYLIB/QRPGSRC/PROG*`)
- **Quote warning tooltip** - Persistent warning when search term contains quotes
- **Before context lines** - Added -B flag support (previously only had -A for after)
- **Separate before/after inputs** - Individual controls for context lines before and after matches
- **Wildcard validation** - Only allows wildcards at end of words (PROD* valid, *PROD invalid)

### Changed
- **"Libraries" → "Search Location"** - Renamed field to reflect granular library/file/member support
- **Tab-based mode selection** - Replaced "Smart-search (REGEX)" checkbox with subtle tab UI
- **Default context lines** - Changed from 0 to 2 before and 2 after
- **Settings migration** - All settings reset to new defaults on upgrade to v1.1.1

### Fixed
- **Double-quote search bug** - Removed auto-quote wrapping that broke searches with literal quotes
- **Multi-word searches** - No longer auto-wrapped, search terms used exactly as typed
- **Context line parser** - Enhanced to handle both -A and -B flags with proper line detection

### UI/UX Improvements
- **Persistent quote warning** - Shows whenever user types quotes (single or double)
- **Context lines expand/collapse** - Before/After inputs only shown when "Show Context Lines" checked
- **Search location examples** - Added helpful placeholder examples for all supported formats
- **Help tooltips updated** - New (?) icons with comprehensive explanations for Search Location and Context Lines

### Technical Changes
- Updated `SearchFormData` interface to include `searchMode` and `beforeContext`
- Added `parseSearchLocation()` method with wildcard validation
- Enhanced `buildPFGREPCommand()` to support -B flag
- Implemented version migration system in `SettingsManager`
- Updated default settings to include beforeContext: 2, afterContext: 2

### Breaking Changes
- **Settings reset required** - All saved patterns and settings cleared on upgrade
- **Search location format** - Old comma-separated library lists still work, but new format supports file/member granularity

## [1.1.0] - 2025-01-09

### 🎉 Major UI/UX Overhaul - Simplified Search Experience

### Added
- **Smart-search (REGEX) mode** - Toggle between Normal text search and Regex patterns
- **Contextual help icons (?)** - Click-to-show tooltips for each search option
- **Regex validation** - Client-side validation with animated error modal
- **Context lines support** - Fixed parser to properly display lines after matches (0-50 range)
- **Auto-quote wrapping** - Multi-word searches automatically wrapped in quotes (Normal mode only)
- **Dynamic mode tips** - Context-aware tips that change based on search mode
- **5000 match limit warning** - Notification when search results are capped
- **Context line visualization** - Dimmed icon for context lines vs actual matches

### Changed (Breaking)
- **Case Sensitive option** - Flipped from "Case Insensitive" (checked) → "Case Sensitive" (unchecked)
  - Default is now case-insensitive unless box is checked
  - Logic inverted: `-i` flag added when caseSensitive = false
- **Smart-search (REGEX) option** - Renamed from "Fixed String" with inverted behavior
  - Default is now Normal Search (fixed string with `-F` flag)
  - When checked, enables full PCRE regex mode
- **Hardcoded max matches to 5000** - Removed user input, always limits to 5000 results
- **Always recursive** - Removed checkbox, always enabled with `-r` flag
- **Always show line numbers** - Removed checkbox, always enabled with `-n` flag

### Removed
- **Whole Words option** - Use `\bWORD\b` in regex mode instead
- **Invert Matches option** - Confusing for users, rarely used
- **Silent Errors option** - Hides real problems, bad UX
- **Non-Source Files option** - Wrong tool for data file searches
- **Don't Trim Whitespace option** - Parser always trimmed, not needed for modern code
- **Max Matches input field** - Hardcoded to 5000
- **Advanced Options section** - Merged with main Search Options

### Fixed
- **Context line parsing** - Now properly handles `-A` flag with `-` separator
- **Context line display** - Shows context lines with proper visual distinction
- **Settings migration** - Reset to new defaults (caseSensitive: false, smartSearchRegex: false)

### Technical Changes
- Updated `FastPfuriousOptions` interface with new property names
- Fixed `resultsTreeProvider` to display context lines with dimmed icons
- Updated default settings in `settingsManager`
- Improved PFGREP command building with hardcoded flags
- Enhanced output parsing for match vs context line detection

### Documentation
- Updated README with new search modes and examples
- Added Normal Search vs Regex Search comparison
- Documented new 5000 match limit
- Removed outdated advanced options documentation

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

### [1.3.0] - Planned
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