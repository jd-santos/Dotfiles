# Pi Agent Config

Personal Pi configuration with extensions for write gating, auto-formatting, cost tracking, usage analytics, git summaries, footer layout, and UI tweaks.

## Files

| File                                  | Purpose                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `settings.base.json`                  | Shared settings (theme, packages, skills path, enabled models)                        |
| `AGENTS.md`                           | Global agent instructions loaded each session                                         |
| `extensions/permission-gate.ts`       | Interactive gate for writes and shell commands                                        |
| `extensions/format-on-save.ts`        | Auto-format files after write/edit                                                    |
| `extensions/cost-tracker.ts`          | Token and cost tracking (`/costs`)                                                    |
| `extensions/lg.ts`                    | Scripted git change summary (`/lg`, `/lg --staged`, `/lg --all`)                      |
| `extensions/tps-tracker.ts`           | Live tokens-per-second status and end-of-turn notification                            |
| `extensions/usage.ts`                 | Pi and Codex CLI usage analytics (`/usage`)                                           |
| `extensions/conversation-summary.ts`  | Live short conversation summary for the footer and session name (`/summary`)           |
| `extensions/promptfoo-export.ts`      | Promptfoo eval stub export for the active Pi branch (`/promptfoo-export`)             |
| `extensions/ui-read-and-shortcuts.ts` | Read previews, slash command keybinding hints, editor banner, and model source status |
| `extensions/footer.ts`                | Central footer for location, model, tokens, MCP, permissions, and extension statuses  |
| `themes/catppuccin-*.json`            | Catppuccin Latte, Frappé, Macchiato, and Mocha themes                                 |
| `themes/dracula.json`                 | Dracula community theme                                                               |
| `prompts/plan.md`                     | `/plan` template for two-round planning                                               |

**Not tracked:** `auth.json`, `sessions/`, `bin/`, `settings.json` (generated), `settings.local.json` (machine-specific overrides).

## Settings

Shared settings live in `settings.base.json` (tracked). Machine-specific overrides (provider, model) go in `settings.local.json` (not tracked). Run `merge-settings` after pulling to combine them into `settings.json`, which Pi actually reads.

Scoped model cycle (`Ctrl+P`) comes from `enabledModels` in `settings.base.json`.

Other settings: Catppuccin Mocha theme, thinking level medium, thinking block visible on output, quiet startup, `pi-mcp-adapter` and `pi-lens` packages loaded, skills path `~/.agents/skills`.

### Changing models

- Change shared model lists in `settings.base.json`, machine-specific defaults in `settings.local.json`.
- Change the scoped `Ctrl+P` shortlist with `enabledModels`.
- Use `/model` for the full selector.
- Use `/scoped-models` to toggle the scoped list interactively.

If Pi opens on a different model during a resumed session, that session's restored model wins for that session. Start a fresh session with `/new` or `pi --no-session` to use the configured default.

## Extensions

### Permission Gate

Location: `extensions/permission-gate.ts`

Prompts before writes, edits, and unrecognized shell commands. Each prompt shows an optional note field first (sent to the model as a reason or guidance), then the allow/deny choice, then a scope picker for always-allow rules. The prompt also triggers the below-editor pointer widget and the cmux alert hooks. Comment-only lines are treated as safe no-ops, and the read-only allowlist includes common inspection commands like `ls`, `rg`, and specific read-only `git` subcommands such as `status`, `diff`, `log`, `branch`, `show`, `rev-parse`, `ls-files`, and `grep`.

#### Commands

| Command        | Effect                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------ |
| `/readonly`    | Toggle read-only mode. Blocks all writes, restricts bash to the safe list                  |
| `/yolo`        | Toggle full auto-allow mode. Sensitive files still blocked. Clears session rules on toggle |
| `/rules`       | Show active session rules                                                                  |
| `/reset-rules` | Clear all session rules and start fresh                                                    |

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

| Extension                                                                         | Formatter |
| --------------------------------------------------------------------------------- | --------- |
| `.js`, `.jsx`, `.ts`, `.tsx`, `.json`, `.css`, `.scss`, `.html`, `.md`, `.svelte` | Prettier  |
| `.py`, `.pyi`                                                                     | Ruff      |
| `.go`                                                                             | gofmt     |
| `.gd`                                                                             | gdformat  |

Formatters must be on `$PATH`. Files with unrecognized extensions are skipped silently.

---

### Cost Tracker

Location: `extensions/cost-tracker.ts`

Accumulates token usage from every assistant message and counts tool calls per tool. Run `/costs` to see the breakdown.

Token attribution is per-message, not per-tool-call (Pi doesn't expose per-tool token data). Tool call counts show which tools are being used; message totals show actual spend.

Output includes: tokens in/out, estimated cost, and a per-tool call count table.

---

### Git Summary

Location: `extensions/lg.ts`

Run `/lg` to show a scripted summary of unstaged git changes below the editor. It uses git commands for per-file additions and deletions instead of asking the model to estimate them.

Modes:

| Command        | Scope                                       |
| -------------- | ------------------------------------------- |
| `/lg`          | Unstaged changes plus untracked files       |
| `/lg --staged` | Staged changes                              |
| `/lg --all`    | Changes against `HEAD` plus untracked files |

Untracked text files are counted as additions. Binary files show `binary` for the changed line count.

---

### TPS Tracker

Location: `extensions/tps-tracker.ts`

Publishes live tokens-per-second while the assistant streams. The central footer shows it only while active, then the extension posts a notification with final output tokens and streaming time.

Live values use provider usage when available. Before final usage lands, the extension estimates output tokens from streamed characters.

---

### Usage Analytics

Location: `extensions/usage.ts`

Run `/usage` to parse local Pi and Codex CLI session files and show a Markdown usage report below the editor.

The report covers the last 1, 7, 30, and 90 days. Each window groups by source and model, with turns, input tokens, output tokens, cached input tokens, total tokens, and estimated price. Pricing comes from `models.dev` when a model match is available. Unknown rates are priced as `$0` and listed in the notes.

Read paths:

- `~/.pi/agent/sessions/**/*.jsonl`
- `~/.codex/sessions/**/*.jsonl`
- `~/.codex/archived_sessions/**/*.jsonl`

The extension reads session JSONL files locally and only displays aggregate usage data.

---

### Promptfoo Export

Location: `extensions/promptfoo-export.ts`

Run `/promptfoo-export [name]` to export the active Pi branch as a promptfoo evaluation stub.

Exports are written outside the dotfiles repo:

```text
~/.pi/agent/evals/promptfoo/<name>-<timestamp>/
```

Each export includes:

- `conversation.json`: normalized message records
- `conversation.md`: Markdown transcript
- `original-user-request.txt`: first user message
- `judge-prompt.txt`: starter LLM-as-judge prompt
- `promptfooconfig.json`: starter promptfoo config
- `README.md`: local run notes

These exports can contain private prompts, local paths, tool outputs, and model responses. Redact before sharing.

---

### Conversation Summary

Location: `extensions/conversation-summary.ts`

Generates a short 8-15 word summary for the active interactive session. The summary appears in the footer and becomes the session name.

Guardrails:

- Runs only when UI is available, so print-mode Pi runs cannot trigger it
- Calls `openai-codex/gpt-5.4-mini` directly with Pi's `complete()` helper instead of spawning another `pi` process
- Falls back to `anthropic/claude-haiku-4-5` only when the primary summary model is not configured
- Disables thinking for the summary request
- Does not fall back to the active conversation model
- Runs after `agent_end`, at most once per user request
- Skips updates until at least 2 new assistant messages and 60 seconds have passed
- Stops automatic updates after 25 summaries in one session
- Sends only a bounded sketch of recent user and assistant text to the summary model

Use `/summary` to show the current value, `/summary <text>` to set it manually, or `/summary clear` to reset it.

---

### Footer

Location: `extensions/footer.ts`

Replaces Pi's default footer with a compact multiline layout:

- Line 1: working directory, git branch, and session name when no live conversation summary exists
- Line 2: context usage and token/cost details (`◷ ctx` with a colored bar, context percent/max plus auto-compaction, `↑` input, `↓` output, `R` cache read, `W` cache write)
- Status line: pi-lens/LSP, permission mode, active TPS, usage scan status, and other extension statuses
- Final line: conversation summary, when available

Pi renders all footer content in one footer slot, so plugin output cannot move below it.

The footer reads statuses published by other extensions with `ctx.ui.setStatus()`, so those extensions keep their own logic while layout stays in one place.

### UI: Read Preview and Slash Shortcuts

Location: `extensions/ui-read-and-shortcuts.ts`

Four interface tweaks:

**Read preview.** `read` tool results show a 5-line preview by default instead of the full output. Use the normal expand shortcut to see more. The preview renders on a distinct background so it doesn't blend into write/edit results.

**Slash command hints.** Slash command autocomplete appends the bound keybinding next to commands that have one (for example `/model`, `/new`, `/fork`). Key text comes from the active keybinding config, so custom values from `~/.pi/agent/keybindings.json` show up automatically.

**Editor banner.** The input editor gets a louder top border with a `YOU` label. The bottom border shows the active model, thinking level, provider, auth type (`sub` or `key`), and whether the model came from the default config, scoped cycling, manual selection, or session restore.

**Restore hint.** If a resumed session restores an older model, Pi shows a notification so it's obvious why the configured default did not win.

The extension overrides the built-in `read` tool using Pi's exported `createReadToolDefinition()`, so execution is unchanged.

## Theme

Locations: `themes/catppuccin-*.json`, `themes/dracula.json`

Catppuccin Latte, Frappé, Macchiato, and Mocha themes are available. Mocha is the default via `"theme": "catppuccin-mocha"` in `settings.base.json`.

The Dracula theme is still available as `dracula`.

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
