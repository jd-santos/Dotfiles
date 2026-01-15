-- LazyVim configuration with language extras
-- This file configures which LazyVim extras to load

return {
  {
    "lazyvim/lazyvim",
    ---@type LazyVimConfig
    opts = {
      -- Add language server support via extras
      extras = {
        -- Programming languages
        "lazyvim.plugins.extras.lang.python",
        "lazyvim.plugins.extras.lang.typescript",
        "lazyvim.plugins.extras.lang.go",
        "lazyvim.plugins.extras.lang.json",
        "lazyvim.plugins.extras.lang.toml",
        "lazyvim.plugins.extras.lang.markdown",
        "lazyvim.plugins.extras.lang.lua",
        -- LSP and formatting
        "lazyvim.plugins.extras.lsp.none-ls",
      },
    },
  },
  -- Your custom plugins/configs can go here
  -- Keep colorscheme, options, autocmds, and keymaps in their respective files
}
