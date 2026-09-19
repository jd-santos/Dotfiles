-- Core LazyVim configuration
-- Configure LazyVim itself and add any essential customizations

return {
  -- Configure LazyVim's default options
  {
    "LazyVim/LazyVim",
    opts = {
      -- Colorscheme: Catppuccin Latte
      colorscheme = "catppuccin-latte",
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
                width = 32,
                min_width = 32,
              },
            },
          },
        },
      },
    },
  },
}
