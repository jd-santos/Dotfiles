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

If you'd like to give these a spin, you can use `GNU Stow`. For example, to set up the zsh configuration:

```bash
stow zsh
```

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
