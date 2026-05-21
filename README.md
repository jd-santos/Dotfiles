# My Dotfiles

Personal dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/). Each top-level directory maps to `$HOME` when stowed.

## Packages

| Package                               | Description                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [`agents`](agents/README.md)          | AI agent skills ([Agent Skills](https://agentskills.io) standard)                                                      |
| `fzf`                                 | [fzf](https://github.com/junegunn/fzf) setup (PATH and shell integration)                                              |
| `ghostty`                             | [Ghostty](https://ghostty.org) terminal (Dracula theme, Nerd Font icons)                                               |
| `git`                                 | Git config, global gitignore, LFS, [`~/.gitconfig.local`](git/.gitconfig.local.example) for machine-specific overrides |
| `lint`                                | Markdown lint rules (`.markdownlint.jsonc`)                                                                            |
| [`nvim`](nvim/.config/nvim/README.md) | Neovim (LazyVim, fzf-lua, tokyonight)                                                                                  |
| `opencode`                            | [OpenCode](https://opencode.ai/) AI assistant config                                                                   |
| [`pgcli`](pgcli/README.md)            | [pgcli](https://www.pgcli.com/) PostgreSQL CLI (auto-completion, keyring, env var connection)                          |
| [`pi`](pi/README.md)                  | [Pi](https://pi.dev/) coding agent (extensions, Dracula theme, `/plan` template, MCP servers)                          |
| `starship`                            | [Starship](https://starship.rs/) prompt with Nerd Font icons                                                           |
| `tmux`                                | Tmux (backtick prefix, vim-style navigation, nested session support)                                                   |
| `zed`                                 | [Zed](https://zed.dev/) editor settings                                                                                |
| [`zsh`](zsh/ALIASES_AND_FUNCTIONS.md) | Zsh (aliases, functions, `extract`, `cdf`, gcloud SDK)                                                                 |

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

| Date       | Change                                                                         |
| ---------- | ------------------------------------------------------------------------------ |
| 2026-05-07 | Added `ui-read-and-shortcuts` Pi extension (read preview, slash command hints) |
| 2026-05-04 | Updated Pi enabled models                                                      |
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
