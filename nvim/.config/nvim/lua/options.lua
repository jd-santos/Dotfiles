-- Set <space> as the leader key
-- See `:help mapleader`
-- NOTE: Must happen before plugins are loaded (otherwise wrong leader will be used)
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- Set options
vim.opt.encoding = "utf-8"    -- Set default encoding to UTF-8
vim.opt.fileencoding = "utf-8" -- Set file encoding to UTF-8

vim.opt.number = true         -- Show line numbers
vim.opt.relativenumber = true -- Show relative line numbers

vim.opt.tabstop = 2           -- Number of spaces a tab counts for
vim.opt.shiftwidth = 2        -- Size of an indent
vim.opt.expandtab = true      -- Use spaces instead of tabs
vim.opt.autoindent = true     -- Copy indent from current line when starting a new line

vim.opt.wrap = false          -- Disable line wrapping

vim.opt.hlsearch = true       -- Highlight search results
vim.opt.incsearch = true      -- Show search results as you type

vim.opt.termguicolors = true  -- Enable 24-bit RGB color in the terminal

vim.opt.scrolloff = 8         -- Lines of context around the cursor
vim.opt.sidescrolloff = 8     -- Columns of context around the cursor

vim.opt.mouse = "a"           -- Enable mouse support
