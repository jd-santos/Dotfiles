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

### Starship (`starship.toml`)

My prompt is crafted with `Starship` and inspired by the `gruvbox_dark` palette. It's not just pretty; it's functional, using Nerd Font icons and clever directory substitutions to keep things informative and clean.

### OpenCode (`opencode-*`)

Configuration for [OpenCode](https://opencode.ai/), an AI coding assistant that helps with planning, building, and asking questions about code:

*   **opencode-core/**: Shared base configuration settings
*   **opencode-home/**: Personal agent prompts (plan, build, ask, plan-deep) for personal projects
*   **opencode-work/**: Work-specific agent configurations for professional development

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

## Structure

- `docs/`: Additional documentation (Neovim setup guides and more)
- `emby/`: Emby media server configuration
- `fzf/`: fzf fuzzy finder configuration
- `git/`: Git configuration
- `nvim/`: Neovim configuration (LazyVim-based)
- `opencode-core/`: Core OpenCode base configuration
- `opencode-home/`: OpenCode agent configurations for personal use
- `opencode-work/`: OpenCode agent configurations for work
- `starship/`: Starship prompt configuration
- `vim/`: Legacy Vim configuration
- `zsh/`: Zsh shell configuration

Enjoy!
