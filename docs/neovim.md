# Neovim Configuration

This document outlines the structure and features of the Neovim configuration. The setup is designed to be simple, modular, and easy to extend, using `lazy.nvim` for plugin management.

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

-   **Fuzzy Finder**: `nvim-telescope/telescope.nvim`
    -   A powerful fuzzy finder to quickly navigate files, buffers, and search for text.
    -   **Keybindings**:
        -   `<leader>ff`: Find files in the current project.
        -   `<leader>fg`: Search for a string in all project files (live grep).
        -   `<leader>fb`: Search through open buffers.
        -   `<leader>fh`: Search Neovim's help tags.

### Code Intelligence

-   **LSP Installer**: `williamboman/mason.nvim`
    -   Simplifies the process of installing and managing Language Server Protocol (LSP) servers.

-   **LSP Configuration**: `neovim/nvim-lspconfig`
    -   Automatically configures installed LSPs to provide features like go-to-definition, diagnostics, and hover information.
    -   The Lua language server (`lua_ls`) is installed by default to provide intelligence for the Neovim configuration itself.

-   **Autocompletion**: `hrsh7th/nvim-cmp`
    -   A flexible completion engine that provides suggestions from the LSP, snippets, and other sources as you type.
