# Pi Agent Config

Personal Pi configuration with an interactive permission gate for file writes and shell commands.

## Permission Gate Extension

Location: `.pi/agent/extensions/permission-gate.ts`

An interactive gate that prompts before writes, edits, and unrecognized bash commands. Two-step TUI flow: choose once/always/deny, then pick the scope.

### Commands

| Command | Effect |
|---------|--------|
| `/readonly` | Toggle read-only mode — blocks all writes, restricts bash to safe list |
| `/yolo` | Toggle full auto-allow mode. Sensitive files still blocked. Clears session rules on toggle |
| `/rules` | Show active session rules |
| `/reset-rules` | Clear all session rules — start fresh |

### Auto-allow rules

The gate builds session rules as you work. When you see a prompt, pick **✓ Always allow…** and choose the scope:

- **📁 📂 📂📂 Directory scope** — current, parent, or grandparent directory
- **🔧 Tool type** — all `write`, `edit`, or `bash` operations
- **⌨️ Command pattern** — individual command tokens (`cd`, `ls`, `npm`)
- **⌨️ All command patterns** — grouped patterns for chained commands
- **⚡ Everything (full yolo)** — skip all prompts for this session

Same scopes work for **deny**. Rules are ephemeral — they reset between Pi sessions.

### Priority order

```
readonly mode        → block everything
sensitive file list  → always block (.env, .ssh, credentials)
deny rules           → block matching operations
allow rules          → allow matching operations
safe-list            → auto-allow safe reads (ls, git status, etc.)
prompt user          → TUI selector
```

### Chained commands

The gate detects `&&`, `\|\|`, `;`, `\|`, and `\n` command chains:

- **Safe-list check** — every part must be safe (e.g. `cd foo && ls` → prompts because `cd` is not on the safe-list)
- **Deny check** — if any part is sensitive, the whole chain is blocked
- **Pattern extraction** — individual tokens (`cd`, `ls`) shown in the scope selector

### Security note

This is a convenience gate, not a security sandbox. Command splitting is naive — no quoting or subshell awareness. Commands like `sh -c "cat .env"` bypass pattern checks. The LLM already has full shell access; this extension surfaces risky operations so you can see and control them.
