local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
-- Check if lazy.nvim is installed; if not, clone it.
if not vim.fn.isdirectory(lazypath) then
  print("Cloning lazy.nvim...") 
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", 
    lazypath,         
  })
end

-- Prepend lazy.nvim to the runtime path.
vim.opt.rtp:prepend(lazypath)

local plugins = {}
local opts = {}

require("lazy").setup(plugins,opt)
