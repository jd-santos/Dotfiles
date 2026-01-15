-- Disable nvim-lint for markdown
return {
  "mfussenegger/nvim-lint",
  opts = {
    linters_by_ft = {
      markdown = {},
    },
  },
}