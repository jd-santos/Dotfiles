local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"

if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", -- latest stable release
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- Ensure lazy.nvim is loaded before attempting to use it.
-- The 'pcall' is important here to handle cases where lazy might not be immediately available.
local lazy_ok, lazy = pcall(require, "lazy")
if not lazy_ok then
  error("Failed to load lazy.nvim: " .. lazy)
end

require("options") -- Load basic editor options

local opts = {}

lazy.setup("plugins", opts)

require("colorscheme") -- Set the colorscheme
