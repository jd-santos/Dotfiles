-- Core LazyVim configuration
-- Configure LazyVim itself and add any essential customizations

return {
  -- Configure LazyVim's default options
  {
    "LazyVim/LazyVim",
    opts = {
      -- Colorscheme: Catppuccin Macchiato
      colorscheme = "catppuccin-macchiato",
    },
  },
  {
    "folke/snacks.nvim",
    opts = {
      picker = {
        sources = {
          explorer = {
            layout = {
              layout = {
                width = 28,
                min_width = 28,
              },
            },
          },
        },
      },
    },
  },
}
