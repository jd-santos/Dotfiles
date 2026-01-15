-- Plugin specification for LazyVim
-- Import order matters: lazyvim.plugins → lazyvim.plugins.extras → your plugins

return {
  -- 1. Import LazyVim and all its built-in plugins (MUST be first)
  { "LazyVim/LazyVim", import = "lazyvim.plugins" },

  -- 2. Import LazyVim extras for language support
  { import = "lazyvim.plugins.extras" },

  -- 3. Add your custom plugins below
  -- { "myusername/myplugin", opts = {} }
}