# Neovim Configuration

Structure and features of my Neovim setup, using `lazy.nvim` for plugin management.

## File Structure

The configuration is organized into the following files and directories:

-   `init.lua`: The main entry point for the Neovim configuration. It initializes the plugin manager and loads all other modules.
-   `lua/`: This directory contains all the custom Lua modules.
    -   `options.lua`: Sets core Neovim options, like line numbers, indentation, and the leader key.
    -   `colorscheme.lua`: Sets the `tokyonight` colorscheme.
    -   `plugins.lua`: Defines the list of all plugins to be managed by `lazy.nvim`.
    -   `plugins/`: This directory contains individual configuration files for each plugin, keeping the setup modular.

## Core Features and Plugins

### Plugin Manager: lazy.nvim

-   **Plugin**: `folke/lazy.nvim`
-   **Purpose**: Manages all Neovim plugins, handling installation, updates, and lazy loading.

### UI and Appearance

-   **Colorscheme**: `folke/tokyonight.nvim`
    -   A clean, dark theme for Neovim. The `tokyonight-storm` variant is used.

-   **File Explorer**: `nvim-tree/nvim-tree.lua`
    -   A file explorer tree that allows for easy project navigation.
    -   **Keybinding**: `<leader>e` to toggle the file explorer.

-   **Status Line**: `nvim-lualine/lualine.nvim`
    -   A configurable status line that displays information like the current mode, branch, filename, and diagnostics.

### Navigation and Search

-   **Fuzzy Finder**: `ibhagwan/fzf-lua`
    -   A high-performance fuzzy finder powered by fzf with native Lua implementation.
    -   Provides fast file searching, buffer navigation, and LSP integration.
    -   **Keybindings**:
        -   `<leader>ff`: Find files in the current project.
        -   `<leader>fg`: Search through git files.
        -   `<leader>fb`: Search through open buffers.
        -   `<leader>fh`: Browse recent files (oldfiles).
        -   `<leader>fw`: Grep word under cursor.
        -   `<leader>fs`: Live grep search in all files.
        -   `<leader>fd`: Display document diagnostics.
        -   `<leader>fl`: Search LSP document symbols.

### Code Intelligence

-   **LSP Installer**: `williamboman/mason.nvim`
    -   Simplifies the process of installing and managing Language Server Protocol (LSP) servers.

-   **LSP Configuration**: `neovim/nvim-lspconfig`
    -   Automatically configures installed LSPs to provide features like go-to-definition, diagnostics, and hover information.
    -   The Lua language server (`lua_ls`) is installed by default to provide intelligence for the Neovim configuration itself.

-   **Autocompletion**: `hrsh7th/nvim-cmp`
    -   A flexible completion engine that provides suggestions from the LSP, snippets, and other sources as you type.
