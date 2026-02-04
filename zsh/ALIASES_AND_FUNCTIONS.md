# Zsh Aliases and Functions Reference

This document provides a comprehensive guide to all custom aliases and functions defined in `.zshrc`.

## Table of Contents

- [Core Command Overrides](#core-command-overrides)
- [Enhanced List Commands](#enhanced-list-commands)
- [Navigation](#navigation)
- [File & Directory Management](#file--directory-management)
- [Searching](#searching)
- [Process Management](#process-management)
- [Networking](#networking)
- [Miscellaneous](#miscellaneous)
- [Functions](#functions)
- [macOS Specific](#macos-specific)

---

## Core Command Overrides

Enhanced versions of common commands with useful flags.

| Alias | Command | Description |
|-------|---------|-------------|
| `cp` | `cp -iv` | Copy with interactive prompts and verbose output |
| `mv` | `mv -iv` | Move with interactive prompts and verbose output |
| `mkdir` | `mkdir -pv` | Create directories (parents as needed) with verbose output |
| `ls` | `ls -FGlAhp` | Enhanced ls with colors, long format, and hidden files |
| `less` | `less -FSRXc` | Less pager with useful defaults |
| `cat` | `bat` | Modern cat replacement with syntax highlighting |

---

## Enhanced List Commands

Convenient variations of `ls` for different sorting needs.

| Alias | Command | Description |
|-------|---------|-------------|
| `lx` | `ls -lXB` | Sort by file extension |
| `lk` | `ls -lSr` | Sort by size (smallest to largest) |
| `lt` | `ls -ltr` | Sort by modification time (oldest to newest) |
| `lc` | `ls -ltcr` | Sort by change time (oldest to newest) |
| `lu` | `ls -ltur` | Sort by access time (oldest to newest) |
| `lr` | `ls -R \| grep ":$" \| ...` | Full recursive directory tree listing |

---

## Navigation

Quick navigation shortcuts for moving between directories.

| Alias | Description |
|-------|-------------|
| `cd..` | Go back 1 directory level (for fast typers) |
| `..` | Go back 1 directory level |
| `...` | Go back 2 directory levels |
| `.3` | Go back 3 directory levels |
| `.4` | Go back 4 directory levels |
| `.5` | Go back 5 directory levels |
| `.6` | Go back 6 directory levels |

---

## File & Directory Management

| Command | Description |
|---------|-------------|
| `numFiles` | Count non-hidden files in current directory |
| `zipf()` | Create a ZIP archive of a folder. Usage: `zipf folder_name` |

---

## Searching

Functions and aliases for finding files and content.

| Command | Description |
|---------|-------------|
| `qfind` | Quick file search using `find` |
| `ff()` | Find file under current directory. Usage: `ff filename` |
| `ffs()` | Find file whose name starts with a string. Usage: `ffs prefix` |
| `ffe()` | Find file whose name ends with a string. Usage: `ffe suffix` |
| `ft()` | Find text in any file. Usage: `ft "search_text" "*.ext"` |

---

## Process Management

Monitor and manage system processes.

| Alias | Description |
|-------|-------------|
| `memHogsTop` | Find top memory-consuming processes (top output) |
| `memHogsPs` | Find top memory-consuming processes (ps output) |
| `cpuHogs` | Find top CPU-consuming processes |
| `topForever` | Run top continuously every 10 seconds |
| `ttop` | Lightweight top with minimal resource usage |
| `tm` | Search for a process. Usage: `tm process_name` |

---

## Networking

Network and connection related commands.

| Alias | Description |
|-------|-------------|
| `myIP` | Display your public-facing IP address |
| `netCons` | Show all open TCP/IP sockets |
| `lsock` | Display open sockets (requires sudo) |
| `lsockU` | Display only open UDP sockets |
| `lsockT` | Display only open TCP sockets |
| `openPorts` | Show all listening connections |

---

## Miscellaneous

General utility aliases.

| Alias | Description |
|-------|-------------|
| `c` | Clear terminal display |
| `ducks` | List top 10 largest files/directories in current dir |
| `path` | Display all directories in your PATH |
| `szsh` | Reload `.zshrc` configuration |

---

## Functions

Detailed function reference with usage examples.

### `cd()`

Override of the default `cd` command that automatically lists directory contents.

**Usage:** `cd <directory>`

**Example:**
```bash
$ cd ~/projects
# Automatically runs 'ls' to show directory contents
```

**Notes:**
- Skipped if PS1 is not set (non-interactive shells)
- Improves navigation by showing what's in the directory you just entered

---

### `mcd()`

Create a new directory and immediately change into it (mkdir + cd combined).

**Usage:** `mcd <directory_path>`

**Example:**
```bash
$ mcd ~/projects/my-new-project
```

---

### `showa()`

Search your `.zshrc` file for aliases and functions matching a pattern.

**Usage:** `showa <pattern>`

**Example:**
```bash
$ showa ls  # Shows all aliases/functions containing 'ls'
```

**Notes:**
- Case-insensitive search
- Opens results in a pager for easy navigation

---

### `extract()`

Extract most known archive types with a single command.

**Usage:** `extract <archive_file>`

**Supported Formats:**
- `.tar.bz2`, `.tar.gz`, `.bz2`, `.rar`, `.gz`, `.tar`, `.tbz2`, `.tgz`, `.zip`, `.Z`, `.7z`

**Example:**
```bash
$ extract archive.tar.gz
$ extract file.zip
```

**Dependencies:** tar, unzip, unrar, 7z (as needed)

---

### `findPid()`

Find the process ID of a running process by name.

**Usage:** `findPid <process_name>`

**Example:**
```bash
$ findPid node      # Returns PID(s) of node processes
$ findPid python
```

**Dependencies:** lsof (list open files)

---

### `venv()`

Activate a Python virtual environment in the current directory.

**Usage:** `venv`

**Supported Directory Names:** `venv` or `.venv`

**Example:**
```bash
$ cd my-python-project
$ venv  # Activates the virtual environment
```

**Notes:**
- Checks for both `venv/bin/activate` and `.venv/bin/activate`
- Returns an error if neither is found
- Common workflow: Clone a Python project, then run `venv`

---

### `myPs()`

List processes owned by the current user with detailed information.

**Usage:** `myPs [ps_options]`

**Output Columns:** PID, CPU%, Memory%, start time, elapsed time, BSD time, command

**Example:**
```bash
$ myPs           # List all user's processes
$ myPs aux       # With additional flags
```

---

### `ii()`

Display useful host-related information (macOS specific).

**Usage:** `ii`

**Displays:**
- Hostname
- OS information
- Logged-in users
- Current date
- Machine uptime
- Current network location

**Notes:**
- macOS specific: Uses `scselect` for network location
- Uses colored output for better readability

---

## macOS Specific

Additional macOS-specific aliases and functions.

| Command | Description |
|---------|-------------|
| `f` | Open current directory in Finder |
| `trash()` | Move a file to the macOS trash |
| `ql()` | Open file in macOS Quick Look |
| `DT` | Pipe content to file on Desktop |
| `cdf()` | Change to frontmost Finder window directory |
| `spotlight()` | Search for file using macOS Spotlight metadata |
| `flushDNS` | Flush DNS cache |
| `ipInfo0` | Get connection info for en0 |
| `ipInfo1` | Get connection info for en1 |
| `showBlocked` | Show all ipfw rules including blocked IPs |

### `cdf()`

Change directory to the frontmost Finder window.

**Usage:** `cdf`

**Example:**
```bash
$ cdf  # cd's to the folder currently open in Finder
```

**Notes:**
- macOS specific: Uses AppleScript to interact with Finder
- Falls back to Desktop if no Finder window is open
- Useful for quick navigation when working with Finder

---

### `spotlight()`

Search for a file using macOS Spotlight's metadata.

**Usage:** `spotlight <filename>`

**Example:**
```bash
$ spotlight "my-document.txt"
```

---

## AWS Profile Prompt

The shell prompt shows your active AWS profile with color-coding.

**Default colors:**
- `production` profile: Red
- `staging` profile: Orange
- `development` profile: Green
- Other profiles: No color

**Customize:** Edit the `aws_profile_prompt()` function in `.zshrc` to add your own profile names and colors.

The AWS profile (if set via `export AWS_PROFILE=...`) appears before the main prompt.

---

## Tips & Tricks

1. **Use `showa` to discover aliases:** If you forget an alias, run `showa keyword` to find it
2. **Combine navigation aliases:** Use `.. cd project` or `...` to move up multiple levels
3. **Check process usage:** Use `memHogsTop` or `cpuHogs` to quickly identify resource hogs
4. **Python workflow:** Use `mcd` to create project dir, then `venv` to activate environment
5. **Extract anything:** `extract` is powerful enough to handle most archive formats

---

## Related Configuration

- See `.zshrc` for the full source code
- See `starship.toml` for prompt configuration
- See `.gitconfig` for Git configuration
