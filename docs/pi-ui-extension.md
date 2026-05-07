# Pi UI extension notes

Adds a local Pi extension for two interface tweaks:

- Read tool calls use a non-green background so they don't blend into write/edit results.
- Read output shows a 5-line preview by default, with the normal expand shortcut for more lines.
- Slash command autocomplete appends shortcut hints when the command maps to a Pi keybinding.

## Approach

The extension overrides the built-in `read` tool by reusing Pi's exported `createReadToolDefinition()` implementation. Execution stays the same. Only the TUI rendering changes.

For slash commands, the extension wraps the active autocomplete provider with `ctx.ui.addAutocompleteProvider()`. It edits returned suggestion descriptions and pulls the displayed key text from Pi's configured keybindings via `keyText()`. This means custom values from `~/.pi/agent/keybindings.json` show up automatically.

## Limits

Pi does not expose a command-to-keybinding registry. The extension keeps a small mapping from slash command names to keybinding IDs, then resolves the actual keys from config. Commands without a known keybinding are unchanged.

The separate read background is implemented with a self-rendered read tool shell. It won't affect other tools or the global theme.
