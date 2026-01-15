-- Plugin specification for LazyVim
-- Import LazyVim and add custom plugins/extras here

return {
  -- Import LazyVim and all its built-in plugins
  {
    "LazyVim/LazyVim",
    import = "lazyvim.plugins",
    opts = {
      -- Add language extras here
      extras = {
        "lazyvim.plugins.extras.lang.python",
        "lazyvim.plugins.extras.lang.typescript",
        "lazyvim.plugins.extras.lang.go",
        "lazyvim.plugins.extras.lang.json",
        "lazyvim.plugins.extras.lang.toml",
        "lazyvim.plugins.extras.lang.markdown",
        "lazyvim.plugins.extras.lang.lua",
        "lazyvim.plugins.extras.lsp.none-ls",
      },
    },
  },

  -- Add your custom plugins below
  -- { "myusername/myplugin", opts = {} }
}
