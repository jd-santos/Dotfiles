-- Main plugin spec for LazyVim
-- Import order: lazyvim.plugins → extras → your plugins

return {
  -- 1. Import LazyVim and all its built-in plugins (MUST be first)
  { "LazyVim/LazyVim", import = "lazyvim.plugins" },
}