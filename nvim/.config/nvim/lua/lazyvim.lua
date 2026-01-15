-- LazyVim extras configuration
-- This file specifies which language/feature extras to load

return {
  {
    "lazyvim/lazyvim",
    ---@type LazyVimConfig
    opts = {
      -- Specify which extras to load
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
}