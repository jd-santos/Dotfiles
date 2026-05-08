# Pi Agent Config

Personal Pi configuration with extensions for write gating, auto-formatting, cost tracking, and UI tweaks.

## Files

| File | Purpose |
| ---- | ------- |
| `settings.json` | Provider, model, theme, packages, skills path |
| `AGENTS.md` | Global agent instructions loaded each session |
| `extensions/permission-gate.ts` | Interactive gate for writes and shell commands |
| `extensions/format-on-save.ts` | Auto-format files after write/edit |
| `extensions/cost-tracker.ts` | Token and cost tracking (`/costs`) |
| `extensions/ui-read-and-shortcuts.ts` | Read previews and slash command keybinding hints |
| `themes/dracula.json` | Dracula community theme |
| `prompts/plan.md` | `/plan` template for two-round planning |

**Not tracked:** `auth.json`, `sessions/`, `bin/` — excluded via the global `.gitignore`.

## Settings

Default provider: `anthropic`. Default model: `claude-sonnet-4-6`.

Enabled models: `claude-sonnet-4-6`, `claude-opus-4-7`, `codex`, `moonshotai/kimi-k2.6`, `z-ai/glm-5.1`.

Other settings: Dracula theme, thinking level medium, thinking block hidden on output, `pi-mcp-adapter` and `pi-lens` packages loaded, skills path `~/.agents/skills`.

## Extensions

### Permission Gate

Location: `extensions/permission-gate.ts`

Prompts before writes, edits, and unrecognized shell commands. Two-step TUI flow: choose once/always/deny, then pick the scope.

#### Commands

| Command | Effect |
| ------- | ------ |
| `/readonly` | Toggle read-only mode. Blocks all writes, restricts bash to the safe list |
| `/yolo` | Toggle full auto-allow mode. Sensitive files still blocked. Clears session rules on toggle |
| `/rules` | Show active session rules |
| `/reset-rules` | Clear all session rules and start fresh |

#### Auto-allow rules

The gate builds session rules as you work. When you see a prompt, pick **✓ Always allow…** and choose the scope:

- **📁 📂 📂📂 Directory scope**: current, parent, or grandparent directory
- **🔧 Tool type**: all `write`, `edit`, or `bash` operations
- **⌨️ Command pattern**: individual command tokens (`cd`, `ls`, `npm`)
- **⌨️ All command patterns**: grouped patterns for chained commands
- **⚡ Everything (full yolo)**: skip all prompts for the session

Same scopes work for **deny**. Rules are ephemeral and reset between sessions.

#### Priority order

```
readonly mode        → block everything
sensitive file list  → always block (.env, .ssh, credentials)
deny rules           → block matching operations
allow rules          → allow matching operations
safe-list            → auto-allow safe reads (ls, git status, etc.)
prompt user          → TUI selector
```

#### Chained commands

The gate detects `&&`, `||`, `;`, `|`, and `\n` command chains:

- **Safe-list check**: every part must be safe (`cd foo && ls` prompts because `cd` isn't on the safe list)
- **Deny check**: if any part is sensitive, the whole chain is blocked
- **Pattern extraction**: individual tokens shown in the scope selector

#### Security note

This is a convenience gate, not a security sandbox. Command splitting is naive — no quoting or subshell awareness. Commands like `sh -c "cat .env"` bypass pattern checks. The LLM already has full shell access; the extension surfaces risky operations so you can see and control them.

---

### Format on Save

Location: `extensions/format-on-save.ts`

Runs a formatter after every `write` or `edit` tool call. Failures are reported as warnings but don't interrupt the session.

| Extension | Formatter |
| --------- | --------- |
| `.js`, `.jsx`, `.ts`, `.tsx`, `.json`, `.css`, `.scss`, `.html`, `.md`, `.svelte` | Prettier |
| `.py`, `.pyi` | Ruff |
| `.go` | gofmt |
| `.gd` | gdformat |

Formatters must be on `$PATH`. Files with unrecognized extensions are skipped silently.

---

### Cost Tracker

Location: `extensions/cost-tracker.ts`

Accumulates token usage from every assistant message and counts tool calls per tool. Run `/costs` to see the breakdown.

Token attribution is per-message, not per-tool-call (Pi doesn't expose per-tool token data). Tool call counts show which tools are being used; message totals show actual spend.

Output includes: tokens in/out, estimated cost, and a per-tool call count table.

---

### UI: Read Preview and Slash Shortcuts

Location: `extensions/ui-read-and-shortcuts.ts`

Two interface tweaks:

**Read preview.** `read` tool results show a 5-line preview by default instead of the full output. Use the normal expand shortcut to see more. The preview renders on a distinct background so it doesn't blend into write/edit results.

**Slash command hints.** Slash command autocomplete appends the bound keybinding next to commands that have one (e.g., `/model`, `/new`, `/fork`). Key text comes from the active keybinding config, so custom values from `~/.pi/agent/keybindings.json` show up automatically.

The extension overrides the built-in `read` tool using Pi's exported `createReadToolDefinition()`, so execution is unchanged.

## Theme

Location: `themes/dracula.json`

Dracula community theme. Set as default via `"theme": "dracula"` in `settings.json`. The theme file is committed here so it survives `stow` reinstalls without needing to re-download.

## Prompts

### /plan

Location: `prompts/plan.md`

Two-round planning template. Invoke with `/plan [topic]`.

- **Round 1 (Clarify):** Pi asks 3–7 questions about intent, scope, and constraints. No code or file writes yet.
- **Round 2 (Propose):** Pi restates the problem, offers 2–3 approaches with tradeoffs, and flags remaining unknowns.

The plan is only committed to `TODO.md` or `docs/` on explicit instruction ("write it up", "save to docs"). Code only starts on explicit go-ahead ("build it", "implement").

Pair with `/readonly` to enforce no-writes during planning rounds at the permission level.

## AGENTS.md

Global instructions loaded at the start of every session. Covers:

- **Build Mode workflow**: questions first, docs second, code third
- **Secrets protection**: absolute prohibition on reading `.env*`, credentials, keys
- **Public repo warning**: flag before committing anything sensitive
- **Task tracking**: use the `todo-manager` skill for multi-step work
- **Documentation style**: load `technical-writing-style` skill for any prose
- **Auto-formatting**: don't invoke formatters manually (format-on-save handles it)
- **Permission model**: describes `/readonly`, `/yolo`, `/rules`, `/reset-rules`
