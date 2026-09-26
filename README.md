# My Dotfiles

Personal dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/). Most top-level tool directories map to `$HOME` when stowed. Repo notes live in `docs/`, and repo-local Pi prompts live in `.pi/`.

## Packages and repo-local files

| Package                               | Description                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `.pi/`                                | Repo-local Pi prompt templates, including `/ship`                                                                      |
| [`agents`](agents/README.md)          | AI agent skills ([Agent Skills](https://agentskills.io) standard)                                                      |
| `bin`                                 | User scripts installed to `~/bin`, including `merge-settings` and the Pi auth wrapper                                  |
| `docs/`                               | Repo documentation and the Typst terminal workflow cheatsheet, not a stow package                                      |
| `scripts/`                            | Setup helpers (`setup-agent-skills`, `setup-herdr`, `bootstrap`), not a stow package                                   |
| `fzf`                                 | [fzf](https://github.com/junegunn/fzf) setup (PATH and shell integration)                                              |
| `ghostty`                             | [Ghostty](https://ghostty.org) terminal (Dracula theme, Nerd Font icons)                                               |
| `git`                                 | Git config, global gitignore, LFS, [`~/.gitconfig.local`](git/.gitconfig.local.example) for machine-specific overrides |
| `herdr`                               | [Herdr](https://herdr.dev/) config (tmux-like keys, Dracula theme, portable setup manifest)                            |
| `lint`                                | Markdown lint rules (`.markdownlint.jsonc`)                                                                            |
| [`nvim`](nvim/.config/nvim/README.md) | Neovim (LazyVim, fzf-lua, tokyonight)                                                                                  |
| `opencode`                            | [OpenCode](https://opencode.ai/) AI assistant config and local agent prompts                                           |
| [`pgcli`](pgcli/README.md)            | [pgcli](https://www.pgcli.com/) PostgreSQL CLI (auto-completion, keyring, env var connection)                          |
| [`pi`](pi/README.md)                  | [Pi](https://pi.dev/) coding agent (extensions, Catppuccin theme, `/plan` template, MCP servers)                       |
| `starship`                            | [Starship](https://starship.rs/) prompt with Nerd Font icons                                                           |
| `tmux`                                | Tmux (backtick prefix, vim-style navigation, nested session support)                                                   |
| `zed`                                 | [Zed](https://zed.dev/) editor settings merged by `merge-settings`                                                     |
| [`zsh`](zsh/ALIASES_AND_FUNCTIONS.md) | Zsh (aliases, functions, `extract`, `cdf`, gcloud SDK)                                                                 |

## Keyboard Shortcuts

### Tmux (Prefix: `` ` ``)

| Shortcut                 | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `` ` ``                  | Tmux prefix (activates command mode)             |
| `` ` `` `` ` ``          | Send prefix to nested session                    |
| `F12`                    | Toggle nested-session mode                       |
| `Prefix` + `h/j/k/l`     | Navigate panes (vim-style)                       |
| `Prefix` + `H/J/K/L`     | Resize panes (repeatable)                        |
| `Option+1-9`             | Switch local window 1-9                          |
| `Option+Shift+1-9`       | Send window switch 1-9 to nested session         |
| `Option+z`               | Zoom or unzoom pane                              |
| `Option+d`               | Detach local session                             |
| `Option+n` / `Option+c`  | New window in current path                       |
| `Option+w`               | Choose window                                    |
| `Option+[` / `Option+]`  | Previous or next window                          |
| `Prefix` + `\|`          | Vertical split                                   |
| `Prefix` + `-`           | Horizontal split                                 |
| `Prefix` + `Ctrl+f`      | fzf file preview popup, opens selection in `vim` |
| `Prefix` + `x`           | Close pane                                       |
| `Prefix` + `r`           | Reload tmux config                               |

**Copy Mode (vi-style):** Press `Prefix` + `[` to enter, `v` to select, `y` to copy.

### Herdr (Prefix: `` ` ``)

| Shortcut                     | Description                                   |
| ---------------------------- | --------------------------------------------- |
| Backtick twice               | Send a literal backtick to the active pane    |
| `Prefix` + `c`               | Create a tab                                  |
| `Prefix` + `1-9`             | Switch tabs                                   |
| `Prefix` + `h/j/k/l`         | Navigate panes                                |
| `Prefix` + `Shift+Backslash` | Split right                                   |
| `Prefix` + `-`               | Split down                                    |
| `Prefix` + `x`               | Close pane                                    |
| `Prefix` + `z`               | Zoom or unzoom pane                           |
| `Prefix` + `[`               | Enter vi-style copy mode                      |
| `Prefix` + `r`               | Reload Herdr config                           |
| `Prefix` + `Shift+r`         | Enter resize mode, then use `h/j/k/l`         |
| `Prefix` + `q`               | Detach while leaving panes running            |

Use `herdr --remote <host>` to attach to a remote Herdr server over SSH.
That workflow does not need the tmux F12 nested-session toggle.

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
| 2026-09-25 | Added portable Herdr manifest, `setup-herdr`, and `bootstrap` scripts           |
| 2026-05-31 | Refreshed package docs, stow commands, tmux shortcuts, and cheatsheet source   |
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
stow herdr nvim git starship zsh   # Install multiple configurations
```

### Install Everything

Initialize the Skills submodule before stowing packages:

```bash
git submodule update --init --recursive
stow agents bin fzf ghostty git herdr lint nvim opencode pgcli pi starship tmux zed zsh
```

To initialize, hydrate, and verify the agent skills in one command, run:

```bash
./scripts/setup-agent-skills
```

### Set Up a New Machine

Prerequisites: `git`, `stow`, `jq`, `python3` 3.11 or newer, and
[Herdr](https://herdr.dev/) installed. `bootstrap` stops with a clear error if
one is missing.

`bootstrap` runs the steps above in order, generates merged settings, then
reconciles Herdr integrations and plugins:

```bash
./scripts/bootstrap
```

Herdr registers plugins imperatively, so `scripts/setup-herdr` reads
`herdr/.config/herdr/herdr-setup.toml` and replays it. Re-run it after editing
the manifest, or pass `--refresh` to reinstall integrations after a Herdr
update. Pass `--allow-missing-herdr` to skip the Herdr step on a machine
without Herdr.

> **Trust:** plugin installation runs third-party code as your user, including
> any build commands the plugin declares. Review a plugin's source and
> `herdr-plugin.toml` before adding it to the manifest, and pin `ref` so a
> future run reproduces a known revision instead of whatever upstream HEAD has
> become.

`docs/` is not a stow package. Keep it in the repo unless you intentionally want those files linked into `$HOME`.

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
stowp agents bin fzf ghostty git herdr lint nvim opencode pgcli pi starship tmux zed zsh
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
herdr/.config/herdr/config.toml          → ~/.config/herdr/config.toml
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
