# AGENTS.md

This is a dotfiles repository. Each directory contains configuration for a specific tool.

## General Guidelines

- **Tool-Specific Conventions:** Each directory corresponds to a different tool (e.g., `nvim`, `zsh`, `git`). Adhere to the specific syntax, conventions, and best practices of the tool whose configuration you are modifying.
- **No Unified Commands:** There are no global `build`, `lint`, or `test` commands for this repository. Validation, if any, is performed by the respective tool when it loads the configuration.
- **Style Consistency:** When editing a file, maintain the existing code style, formatting, and naming conventions.

## File-Specific Notes

- **Lua (`.lua`):** For nvim configuration, follow standard Lua style.
- **TOML (`.toml`):** For starship configuration, follow TOML syntax.
- **Shell Scripts (`.zshrc`, `.fzf.zsh`):** Follow general shell scripting best practices.
- **JSON (`.json`):** Ensure valid JSON format.
- **XML (`.xml`):** Ensure valid XML format.

## Error Handling

- Since these are configuration files, error handling is generally not applicable in the traditional sense.
- Errors will typically be reported by the respective tool upon loading the configuration. Ensure your changes are syntactically correct to avoid breaking the tool's functionality.

## Documentation Guidelines

### Keyboard Shortcuts

When adding, modifying, or removing keyboard shortcuts or keybindings in any configuration file, update the README.md's "Keyboard Shortcuts" section to reflect the change.

**Current files with custom shortcuts include:**
- `tmux/.tmux.conf`
- `nvim/.config/nvim/lua/config/keymaps.lua`
- `nvim/.config/nvim/lua/plugins/*.lua`

**When to update README.md:**
- Adding a new keybinding → Add to the appropriate table in README
- Changing an existing keybinding → Update the shortcut in README
- Removing a keybinding → Remove from README

**What to document:**
- Only custom/user-defined shortcuts (not inherited defaults from frameworks like LazyVim)
- Include the key combination and a brief description
- Group by tool (Tmux, Neovim, etc.)
