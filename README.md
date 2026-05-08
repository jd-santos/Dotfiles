# My Dotfiles

Personal dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/). Each top-level directory maps to `$HOME` when stowed.

## Highlights

### Zsh (`.zshrc`)

- **Aliases:** Quick navigation with `..` and `...`, enhanced `ls` commands (`lt` for sorting by date, `lk` for sorting by size), and process management aliases like `memHogsTop`
- **`extract`:** Unpacks almost any archive type
- **`cdf`:** `cd` into your frontmost Finder window
- **gcloud SDK:** Sourced from Homebrew if installed (`google-cloud-sdk`)
- See [Aliases & Functions Reference](zsh/ALIASES_AND_FUNCTIONS.md) for the complete list

### Neovim (`nvim`)

Built on [LazyVim](https://lazyvim.github.io/) with `lazy.nvim` for plugin management.

- See [Neovim Documentation](docs/neovim.md) for configuration details and keybindings

### Git (`git`)

- **Global gitignore:** OS files (`.DS_Store`, `Thumbs.db`), editor files (Vim swaps, VSCode, JetBrains), secrets (`.env*`, keys, credentials), and database CLI history
- **Git LFS:** Pre-configured
- **Default branch:** `main`
- **Local overrides:** `~/.gitconfig.local` for machine-specific settings (SSH keys, work URLs)

The gitignore applies globally across all repositories.

**Setup:**

```bash
stow git  # Symlinks .gitconfig and .gitignore to ~/
cp git/.gitconfig.local.example ~/.gitconfig.local  # Optional: machine-specific settings
```

### pgcli (`pgcli`)

PostgreSQL CLI with syntax highlighting, auto-completion, and vi/emacs editor mode.

- Colors, table format, and pager preferences configured
- Context-aware auto-completion, multi-line queries, destructive warnings enabled
- Passwords stored in macOS Keychain/1Password via keyring integration
- Connect using environment variables or a connection string

**Setup:**

```bash
stow pgcli  # Symlinks config to ~/.config/pgcli/

# Connect using environment variables:
export PGHOST=localhost
export PGPORT=5432
export PGUSER=myuser
export PGDATABASE=mydb
pgcli  # Connects using above env vars

# Or use a connection string:
pgcli postgresql://localhost/mydb
```

**Environment Variables:**
- `PGHOST` - Database host (default: localhost)
- `PGPORT` - Database port (default: 5432)
- `PGUSER` - Username
- `PGDATABASE` - Database name
- `PGPASSWORD` - Password (or use keyring for secure storage)

### Starship (`starship.toml`)

Prompt using Starship with Nerd Font icons.

### Claude Skills (`claude`)

Reusable instruction sets for Claude Code:

- **Skills System:** Domain-specific expertise modules for specialized tasks
- **Custom Workflows:** Processes for code review, API design, testing, and more
- See [Claude Skills README](claude/README.md) for documentation

### OpenCode (`opencode`)

Configuration for [OpenCode](https://opencode.ai/), an AI coding assistant:

- **Base config:** Model settings, MCP servers, formatters, permissions
- **Custom agents:** Plan, build, ask modes with different capabilities

### Pi (`pi`)

Configuration for [pi](https://pi.dev/), a terminal-based coding agent.

- **`settings.json`**: provider, default model, enabled models (including codex, kimi-k2.6, glm-5.1), packages, skills path
- **`AGENTS.md`**: global agent instructions (Build Mode workflow, secrets protection, formatting rules)
- **`extensions/permission-gate.ts`**: write confirmation + `/readonly` toggle; sensitive file access always blocked
- **`extensions/format-on-save.ts`**: auto-format on write (Prettier, Ruff, gofmt, gdformat)
- **`extensions/cost-tracker.ts`**: `/costs` command for session token usage and spend
- **`extensions/ui-read-and-shortcuts.ts`**: read tool preview (5 lines, expandable) and slash command keybinding hints in autocomplete
- **`themes/dracula.json`**: Dracula community theme, set as default
- **`prompts/plan.md`**: `/plan` template for two-round planning (clarify, then propose)
- **`.config/mcp/mcp.json`**: MCP servers (Brave Search, Svelte)

**Not tracked:** `auth.json` (credentials), `sessions/` (chat history), `bin/` (downloaded helpers). Excluded via `git/.gitignore`.

**Setup:** `stow pi` (folds into `~/.pi/agent/`, leaving secrets and runtime state untouched)

## Keyboard Shortcuts

### Tmux (Prefix: `` ` ``)

| Shortcut             | Description                          |
| -------------------- | ------------------------------------ |
| `` ` ``              | Tmux prefix (activates command mode) |
| `` ` `` `` ` ``      | Send prefix to nested session        |
| `Prefix` + `h/j/k/l` | Navigate panes (vim-style)           |
| `Prefix` + `H/J/K/L` | Resize panes (repeatable)            |
| `Option+1-9`         | Quick switch to window 1-9           |
| `Prefix` + `\|`      | Vertical split                       |
| `Prefix` + `-`       | Horizontal split                     |
| `Prefix` + `x`       | Close pane                           |
| `Prefix` + `r`       | Reload tmux config                   |

**Copy Mode (vi-style):** Press `Prefix` + `[` to enter, `v` to select, `y` to copy.

### Neovim (Leader: `Space`)

Custom keybindings on top of [LazyVim defaults](https://www.lazyvim.org/keymaps):

| Shortcut     | Description            |
| ------------ | ---------------------- |
| `jj`         | Exit insert mode       |
| `<leader>ff` | Find files             |
| `<leader>fg` | Find git files         |
| `<leader>fb` | Find buffers           |
| `<leader>fh` | Recent files           |
| `<leader>fw` | Grep word under cursor |
| `<leader>fs` | Live grep              |
| `<leader>fd` | Document diagnostics   |
| `<leader>fl` | LSP document symbols   |

**fzf-lua Navigation:** `Ctrl+d/u` for preview scroll, `Ctrl+f/b` for half-page scroll.

## Changes

| Date       | Change                                                  |
| ---------- | ------------------------------------------------------- |
| 2026-05-07 | Added `ui-read-and-shortcuts` Pi extension (read preview, slash command hints) |
| 2026-05-04 | Added codex, kimi-k2.6, glm-5.1 to Pi enabled models                          |
| 2026-05-03 | Added Build Mode workflow, Dracula theme, and `/plan` template to Pi           |
| 2026-04-30 | Fixed prompt lag from stow misconfig and pyenv shim; added `command_timeout`   |
| 2026-04-22 | Added gcloud SDK PATH sourcing to zsh                                          |
| 2026-01-31 | Added global `.gitignore` with comprehensive defaults                          |
| 2026-01-31 | Changed tmux prefix from `Ctrl+O` to backtick (`` ` ``)                        |
| 2026-01-23 | Added fzf-lua fuzzy finder plugin to Neovim                                    |
| 2026-01-16 | Added `jj` mapping to escape insert mode in Neovim                             |

## Installation

Uses **GNU Stow** to manage symlinks.

### Basic Usage

```bash
cd ~/Dotfiles
stow zsh          # Creates symlinks for all files in zsh/ to ~/
```

### Install Multiple Tools

```bash
stow nvim git starship zsh   # Install multiple configurations
```

### Install Everything

```bash
stow */     # Install all tool configurations
```

### Remove a Configuration

```bash
stow -D zsh         # Delete symlinks for zsh
stow --delete nvim  # Delete symlinks for nvim
```

### Restow (Update Symlinks)

```bash
stow -R zsh         # Restow (delete and reinstall) zsh
```

### Dry Run

```bash
stow -n zsh         # Preview changes (nothing applied)
stow --simulate nvim
```

### Stow with Confirmation

The `stowp` function (included in `.zshrc`) previews changes and prompts before applying:

```bash
stowp */           # Preview all packages, then confirm
stowp nvim zsh     # Preview specific packages, then confirm
```

1. Runs `stow --simulate` to show what would change
2. Warns on conflicts
3. Prompts for `y` before executing

Useful when switching machines or stowing multiple packages at once.

### How It Works

- **Source:** Tool directories in your Dotfiles repo (e.g., `nvim/`, `zsh/`)
- **Target:** Your home directory (`~/`), where symlinks are created
- **Structure:** `nvim/.config/nvim/init.lua` becomes `~/.config/nvim/init.lua`

### Directory Structure

Each stow package contains the full path from `$HOME`:

```
Repository Layout                      → Target Location After Stowing
────────────────────────────────────────────────────────────────────
nvim/.config/nvim/init.lua             → ~/.config/nvim/init.lua
zsh/.zshrc                              → ~/.zshrc
git/.gitconfig                          → ~/.gitconfig
tmux/.tmux.conf                         → ~/.tmux.conf
starship/.config/starship.toml          → ~/.config/starship.toml
```

**Key Principle:** The directory structure _inside_ each package mirrors the path from `$HOME`.

**When creating new config files:**

1. Determine where the file should live (e.g., `~/.config/foo/bar.conf`)
2. Create a package directory (e.g., `foo/`)
3. Replicate the full path inside that package (e.g., `foo/.config/foo/bar.conf`)
4. Run `stow foo` to symlink it

**What NOT to do:**

- ❌ `nvim/init.lua` → Creates `~/init.lua` (wrong!)
- ✅ `nvim/.config/nvim/init.lua` → Creates `~/.config/nvim/init.lua` (correct)

### Common Issues

**Conflict: File already exists**

```bash
mv ~/.zshrc ~/.zshrc.bak    # Back up existing file
stow zsh                     # Then stow
```

**Stow not found**

```bash
brew install stow           # macOS
sudo apt install stow       # Ubuntu/Debian
```

See the [GNU Stow Manual](https://www.gnu.org/software/stow/manual/) for more.

## Structure

- `agents/`: AI agent skills (Agent Skills standard)
- `docs/`: Additional documentation
- `fzf/`: fzf fuzzy finder configuration
- `ghostty/`: Ghostty terminal emulator configuration
- `git/`: Git configuration and global gitignore
- `nvim/`: Neovim configuration (LazyVim-based)
- `opencode/`: OpenCode AI assistant configuration
- `pgcli/`: PostgreSQL CLI (pgcli) configuration
- `pi/`: Pi coding agent configuration
- `starship/`: Starship prompt configuration
- `vim/`: Legacy Vim configuration
- `zed/`: Zed editor configuration
- `zsh/`: Zsh shell configuration
