# My Dotfiles

Hey there! Welcome to my personal dotfiles repository. This is where I keep all my configuration files for various tools, managed neatly with `GNU Stow`.

## Highlights

Here are a few things you might find interesting:

### Zsh (`.zshrc`)

My `zshrc` is packed with quality-of-life improvements:

*   **Smart Aliases:** Quick navigation with `..` and `...`, enhanced `ls` commands (`lt` for sorting by date, `lk` for sorting by size), and handy process management aliases like `memHogsTop`.
*   **Universal Extractor:** The `extract` function handles almost any archive type you throw at it.
*   **macOS Integration:** If you're on a Mac, you'll appreciate `cdf` to `cd` directly into your frontmost Finder window.

### Neovim (`nvim`)

My Neovim setup is lean and mean, powered by `lazy.nvim` for plugin management. It's designed for speed and efficiency.

### Starship (`starship.toml`)

My prompt is crafted with `Starship` and inspired by the `gruvbox_dark` palette. It's not just pretty; it's functional, using Nerd Font icons and clever directory substitutions to keep things informative and clean.

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

- `crush/`: Configuration for Crush
- `emby/`: Configuration for Emby
- `fzf/`: Configuration for fzf
- `git/`: Git configuration
- `nvim/`: Neovim configuration
- `opencode/`: Opencode configuration
- `starship/`: Starship prompt configuration
- `vim/`: Vim configuration
- `zsh/`: Zsh configuration

Enjoy!
