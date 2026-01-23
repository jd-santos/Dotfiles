return {
  "ibhagwan/fzf-lua",
  -- optional for icon support
  dependencies = { "nvim-tree/nvim-web-devicons" },
  config = function()
    local fzf = require("fzf-lua")
    
    fzf.setup({
      -- fzf_opts = { ['--layout'] = 'reverse' },
      -- fzf_opts = { ['--info'] = 'inline' },
      winopts = {
        height = 0.85,
        width = 0.80,
        row = 0.50,
        col = 0.50,
        border = "rounded",
      },
      keymap = {
        builtin = {
          ["<C-d>"] = "preview-page-down",
          ["<C-u>"] = "preview-page-up",
        },
        fzf = {
          ["ctrl-z"] = "abort",
          ["ctrl-u"] = "unix-line-discard",
          ["ctrl-f"] = "half-page-down",
          ["ctrl-b"] = "half-page-up",
        },
      },
      previewers = {
        builtin = {
          ueberzug_scaler = "fit_contain",
        },
      },
      provider = "telescope", -- or 'native'
    })

    -- Keymaps
    local keymap = vim.keymap.set
    local opts = { noremap = true, silent = true }

    -- Files
    keymap("n", "<leader>ff", fzf.files, opts)
    keymap("n", "<leader>fg", fzf.git_files, opts)
    keymap("n", "<leader>fb", fzf.buffers, opts)
    keymap("n", "<leader>fh", fzf.oldfiles, opts)
    
    -- Search
    keymap("n", "<leader>fw", fzf.grep_cword, opts)
    keymap("n", "<leader>fs", fzf.live_grep, opts)
    
    -- LSP
    keymap("n", "<leader>fd", fzf.diagnostics_document, opts)
    keymap("n", "<leader>fl", fzf.lsp_document_symbols, opts)
  end,
}
