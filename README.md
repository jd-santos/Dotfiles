# My Dotfiles

Personal dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/). Each top-level directory maps to `$HOME` when stowed.

## Highlights

### Zsh (`.zshrc`)

My zshrc has quality-of-life improvements:

- **Smart Aliases:** Quick navigation with `..` and `...`, enhanced `ls` commands (`lt` for sorting by date, `lk` for sorting by size), and process management aliases like `memHogsTop`
- **Universal Extractor:** The `extract` function handles almost any archive type
- **macOS Integration:** `cdf` to cd into your frontmost Finder window
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

Modern PostgreSQL CLI with syntax highlighting, auto-completion, and smart features.

- **UI Settings:** Colors, table format, editor mode (vi/emacs), pager preferences
- **Smart Features:** Context-aware auto-completion, multi-line queries, destructive warnings
- **Keyring Integration:** Stores passwords securely in macOS Keychain/1Password
- **Connection Management:** Use environment variables for database connections

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

### OpenCode (`opencode-*`)

Configuration for [OpenCode](https://opencode.ai/), an AI coding assistant:

- **opencode-core/**: Shared base configuration
- **opencode-home/**: Personal agent prompts (plan, build, ask)
- **opencode-work/**: Work-specific agent configurations

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
| 2026-01-31 | Added global `.gitignore` with comprehensive defaults   |
| 2026-01-31 | Changed tmux prefix from `Ctrl+O` to backtick (`` ` ``) |
| 2026-01-23 | Added fzf-lua fuzzy finder plugin to Neovim             |
| 2026-01-16 | Added `jj` mapping to escape insert mode in Neovim      |

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

## Docker Container

Docker container with Opencode and my dotfiles, plus Python, Node.js, and Go.

**Quick Start:**

```bash
cd ~/Dotfiles/docker
cp .env.example ~/.env      # Edit with your API keys
docker compose up -d
ssh -p 2222 dev@localhost
```

See [docker/README.md](docker/README.md) for full setup and troubleshooting.

## Structure

- `claude/`: Claude Code skills for AI workflows
- `docker/`: Docker container for portable dev environment
- `docs/`: Additional documentation
- `emby/`: Emby media server configuration
- `fzf/`: fzf fuzzy finder configuration
- `git/`: Git configuration and global gitignore
- `nvim/`: Neovim configuration (LazyVim-based)
- `opencode-core/`: Core OpenCode configuration
- `opencode-home/`: OpenCode agents for personal use
- `opencode-work/`: OpenCode agents for work
- `pgcli/`: PostgreSQL CLI (pgcli) configuration
- `starship/`: Starship prompt configuration
- `vim/`: Legacy Vim configuration
- `zsh/`: Zsh shell configuration
