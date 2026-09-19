-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

local markdown_diagnostics = vim.api.nvim_create_augroup("markdown_diagnostics", { clear = true })

vim.api.nvim_create_autocmd({ "BufEnter", "LspAttach" }, {
  group = markdown_diagnostics,
  callback = function(args)
    if vim.bo[args.buf].filetype == "markdown" then
      vim.diagnostic.enable(false, { bufnr = args.buf })
    end
  end,
})
