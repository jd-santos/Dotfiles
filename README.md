# My Dotfiles

Hey there! Welcome to my personal dotfiles repository. This is where I keep all my configuration files for various tools, managed neatly with `GNU Stow`.

## Highlights

Here are a few things you might find interesting:

### Zsh (`.zshrc`)

My `zshrc` is packed with quality-of-life improvements:

*   **Smart Aliases:** Quick navigation with `..` and `...`, enhanced `ls` commands (`lt` for sorting by date, `lk` for sorting by size), and handy process management aliases like `memHogsTop`.
*   **Universal Extractor:** The `extract` function handles almost any archive type you throw at it.
*   **macOS Integration:** If you're on a Mac, you'll appreciate `cdf` to `cd` directly into your frontmost Finder window.
*   See [Aliases & Functions Reference](zsh/ALIASES_AND_FUNCTIONS.md) for the complete list and detailed documentation.

### Neovim (`nvim`)

My Neovim setup is built on [LazyVim](https://lazyvim.github.io/), a modern Neovim distribution powered by `lazy.nvim` for plugin management. It's designed for speed and efficiency with sensible defaults.

*   See [Neovim Documentation](docs/neovim.md) for detailed configuration info, plugin setup, and keybindings.

### Git (`git`)

My Git configuration includes:

*   **Global gitignore:** Sensible defaults for common OS files (`.DS_Store`, `Thumbs.db`), editor files (Vim swaps, VSCode settings, JetBrains IDEs), temporary files, and environment secrets (`.env*`, keys, credentials)
*   **Git LFS:** Pre-configured for large file storage
*   **Default branch:** Set to `main`

The `.gitignore` patterns are applied globally across all repositories, keeping your workspace clean without cluttering individual project `.gitignore` files.

### Starship (`starship.toml`)

My prompt is crafted with `Starship` and inspired by the `gruvbox_dark` palette. It's not just pretty; it's functional, using Nerd Font icons and clever directory substitutions to keep things informative and clean.

### Claude Skills (`claude`)

Reusable instruction sets for Claude Code that enhance AI-assisted development:

*   **Skills System:** Domain-specific expertise modules that Claude can load for specialized tasks
*   **Custom Workflows:** Step-by-step processes for code review, API design, testing, and more
*   **Extensible:** Create your own skills for project-specific patterns and best practices
*   See [Claude Skills README](claude/README.md) for detailed documentation on creating and using skills

### OpenCode (`opencode-*`)

Configuration for [OpenCode](https://opencode.ai/), an AI coding assistant that helps with planning, building, and asking questions about code:

*   **opencode-core/**: Shared base configuration settings
*   **opencode-home/**: Personal agent prompts (plan, build, ask, plan-deep) for personal projects
*   **opencode-work/**: Work-specific agent configurations for professional development

## Keyboard Shortcuts

### Tmux (Prefix: `Ctrl+O`)

| Shortcut | Description |
|----------|-------------|
| `Ctrl+O` | Tmux prefix (activates command mode) |
| `Ctrl+O` `Ctrl+O` | Send prefix to nested session |
| `Prefix` + `h/j/k/l` | Navigate panes (vim-style) |
| `Prefix` + `H/J/K/L` | Resize panes (repeatable) |
| `Option+1-9` | Quick switch to window 1-9 |
| `Prefix` + `\|` | Vertical split |
| `Prefix` + `-` | Horizontal split |
| `Prefix` + `x` | Close pane |
| `Prefix` + `r` | Reload tmux config |

**Copy Mode (vi-style):** Press `Prefix` + `[` to enter, `v` to select, `y` to copy.

### Neovim (Leader: `Space`)

Custom keybindings added on top of [LazyVim defaults](https://www.lazyvim.org/keymaps):

| Shortcut | Description |
|----------|-------------|
| `jj` | Exit insert mode |
| `<leader>ff` | Find files |
| `<leader>fg` | Find git files |
| `<leader>fb` | Find buffers |
| `<leader>fh` | Recent files |
| `<leader>fw` | Grep word under cursor |
| `<leader>fs` | Live grep |
| `<leader>fd` | Document diagnostics |
| `<leader>fl` | LSP document symbols |

**fzf-lua Navigation:** `Ctrl+d/u` for preview scroll, `Ctrl+f/b` for half-page scroll.

## Recent Changes

| Date       | Change                                                  |
|------------|---------------------------------------------------------|
| 2026-01-23 | Added fzf-lua fuzzy finder plugin to Neovim            |
| 2026-01-16 | Added `jj` mapping to escape insert mode in Neovim      |

## Installation

This repository uses **GNU Stow** to manage symlinks for dotfiles. Stow makes it easy to maintain configuration files in a organized directory structure while symlinking them to your home directory.

### Basic Usage

Install a single tool's configuration:

```bash
cd ~/Dotfiles
stow zsh          # Creates symlinks for all files in zsh/ to ~/
```

### Install Multiple Tools at Once

```bash
stow nvim git starship zsh   # Install multiple configurations
```

### Install Everything

```bash
stow */     # Install all tool configurations
```

### Remove/Unstow a Configuration

If you want to remove symlinks for a tool:

```bash
stow -D zsh         # Delete symlinks for zsh
stow --delete nvim  # Delete symlinks for nvim
```

### Restow (Update Symlinks)

If you modify the directory structure and need to recreate symlinks:

```bash
stow -R zsh         # Restow (delete and reinstall) zsh
```

### Viewing What Would Happen

Before stowing, you can preview the changes:

```bash
stow -n zsh         # Dry-run (no changes made)
stow --simulate nvim # Simulate (shows what would happen)
```

### Key Concepts

- **Source:** The tool directories in your Dotfiles repo (e.g., `nvim/`, `zsh/`)
- **Target:** Your home directory (`~/`), where symlinks are created
- **Stow creates a tree structure:** If you have `nvim/.config/nvim/init.lua`, stow creates `~/.config/nvim/init.lua` → `dotfiles/nvim/.config/nvim/init.lua`

### Understanding the Directory Structure

GNU Stow works by mirroring directory structures. Each top-level directory (called a "stow package") contains the full path from your home directory to the actual config file.

**Example Structure:**
```
Repository Layout                      → Target Location After Stowing
────────────────────────────────────────────────────────────────────
nvim/.config/nvim/init.lua             → ~/.config/nvim/init.lua
zsh/.zshrc                              → ~/.zshrc
git/.gitconfig                          → ~/.gitconfig
tmux/.tmux.conf                         → ~/.tmux.conf
starship/.config/starship.toml          → ~/.config/starship.toml
```

**Key Principle:** The directory structure *inside* each package mirrors the path from `$HOME`. 

**When creating new config files:**
1. Determine where the file should live in your home directory (e.g., `~/.config/foo/bar.conf`)
2. Choose or create a package directory (usually named after the tool, e.g., `foo/`)
3. Replicate the full path inside that package (e.g., `foo/.config/foo/bar.conf`)
4. Run `stow foo` to symlink it

**What NOT to do:**
- ❌ `nvim/init.lua` → This would create `~/init.lua` (wrong location!)
- ✅ `nvim/.config/nvim/init.lua` → This creates `~/.config/nvim/init.lua` (correct!)

### Common Issues

**Conflict: File already exists**
```bash
# If a file exists at the target location:
mv ~/.zshrc ~/.zshrc.bak    # Back up the existing file
stow zsh                     # Then stow
```

**Stow not found**
```bash
# Install Stow if needed:
brew install stow           # macOS
sudo apt install stow       # Ubuntu/Debian
```

### Reference

For more detailed Stow documentation, see the [GNU Stow Manual](https://www.gnu.org/software/stow/manual/).

## 🐳 Docker Container

Docker container with Opencode and my dotfiles, plus Python, Node.js, and Go. Good for a portable dev environment.

**Quick Start:**

```bash
cd ~/Dotfiles/docker
cp .env.example ~/.env
# Edit ~/.env with your API keys
docker compose up -d
ssh -p 2222 dev@localhost
```

See [docker/README.md](docker/README.md) for full setup, troubleshooting, and usage details.

## Structure

- `claude/`: Claude Code skills - reusable instruction sets for AI workflows
- `docker/`: **Docker container configuration for portable dev environment**
- `docs/`: Additional documentation (Neovim setup guides and more)
- `emby/`: Emby media server configuration
- `fzf/`: fzf fuzzy finder configuration
- `git/`: Git configuration and global gitignore
- `nvim/`: Neovim configuration (LazyVim-based)
- `opencode-core/`: Core OpenCode base configuration
- `opencode-home/`: OpenCode agent configurations for personal use
- `opencode-work/`: OpenCode agent configurations for work
- `starship/`: Starship prompt configuration
- `vim/`: Legacy Vim configuration
- `zsh/`: Zsh shell configuration

Enjoy!
