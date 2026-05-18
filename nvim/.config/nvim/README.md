# Neovim Config

Built on [LazyVim](https://lazyvim.github.io/) with `lazy.nvim` for plugin management.

## File Structure

- `init.lua`: entry point, loads `config.lazy`
- `lua/config/lazy.lua`: bootstraps lazy.nvim, loads LazyVim + extras + custom plugins
- `lua/config/options.lua`: overrides (line wrap off, UTF-8)
- `lua/config/keymaps.lua`: custom keybindings (`jj` to escape insert mode)
- `lua/config/autocmds.lua`: placeholder for custom autocommands
- `lua/plugins/core.lua`: sets colorscheme to tokyonight
- `lua/plugins/fzf-lua.lua`: fuzzy finder with keybindings (see below)
- `lua/plugins/markdown.lua`: disables nvim-lint for markdown files

## LazyVim Extras

Enabled in `config/lazy.lua`:

- `lang.python`, `lang.typescript`, `lang.go`, `lang.toml`
- `lsp.none-ls`
- `ui.mini-animate`

## Custom Keybindings

On top of [LazyVim defaults](https://www.lazyvim.org/keymaps):

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

**fzf-lua navigation:** `Ctrl+d/u` for preview scroll, `Ctrl+f/b` for half-page scroll.
