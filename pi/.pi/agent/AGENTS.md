# Agent Instructions

## Secrets Protection

Never read files that may contain secrets. This is an absolute rule with one narrow exception for Varlock schema files.

Prohibited file patterns:
- `.env*` (all variants: `.env`, `.env.local`, `.env.production`, etc.), except `.env.schema` and `.env-schema`
- `*credentials*`, `*secrets*`, `*token*`, `*.key`, `*.pem`
- `.aws/credentials`, `.ssh/id_rsa*`, `.ssh/id_ed25519*`

Allowed schema exception:
- Varlock schema files named `.env.schema` or `.env-schema` may be read. These files are intended to expose variable names, descriptions, types, validation rules, and resolver expressions such as `awsSecret(...)`, `op(...)`, or `exec(...)`.
- If a schema file appears to contain literal credentials, tokens, passwords, private keys, or connection strings with embedded passwords, stop reading and ask the user to inspect it.

When a user asks for help with one of these files, except allowed Varlock schema files, provide diagnostic commands for the user to run themselves. Do not attempt to read the file contents, even to redact or summarize them.

Diagnostic alternatives to suggest:
- Syntax check: `bash -n .env`
- File type: `file .env`
- Line ending detection: `hexdump -C .env | head`
- Ask the user to describe the format and share only non-sensitive structure

## Public Repositories

Before committing changes, verify whether the repository is public: `gh repo view --json isPrivate`. If it is public, warn before committing anything that could expose sensitive data: API keys, internal URLs, personal identifiers, or work-specific configurations. Suggest safer alternatives: environment variables, `.gitignore`d local configs, or private overlays.

## Task Tracking

When working on multi-step tasks, or when the user mentions todos, use the `todo-manager` skill to maintain the project's `TODO.md`. Invoke it with `/skill:todo-manager` if it does not load automatically.

Active responsibilities:
- Maintain the project's `TODO.md` throughout multi-step work
- Move completed items to the Done section when tasks wrap up
- Proactively flag high-priority issues discovered while working (limit: 1-2 suggestions per session)

## Documentation and Prose

When writing documentation, code comments, READMEs, or any user-facing text, load and follow the `technical-writing-style` skill.

Core requirements from that skill:
- No em dashes
- No marketing language ("seamless", "comprehensive", "enterprise-grade", "best practices")
- No filler introductions that restate headings or add no information
- Casual-professional register: direct and clear, not formal or corporate

### Pi Documentation Maintenance

When working in the Dotfiles repo on the Pi package, keep `pi/README.md` and `pi/docs/reference.md` synced with user-visible changes to extensions, prompts, themes, MCP config, settings, commands, status output, or setup steps. Prefer updating the existing reference doc over creating new docs unless the topic is large enough to justify its own page.

## Build Mode

Planning is a first-class file operation, not a separate mode. There is no plan/act toggle. Thinking, documenting, and implementing are one continuous motion.

### Workflow

1. **Ask questions first.** Before writing any code, ask clarifying questions until the intent is unambiguous. Surface ambiguity as inline questions, not as a planning wall.

2. **Write docs second.** Capture the plan, spec, or design as a committed artifact before implementing. Planning output must not live only in chat. Use:
   - `TODO.md` (via the todo-manager skill) for tasks, next steps, and open questions
   - `docs/` for specs, decisions, or notes that deserve their own named document

3. **Write code third.** Implement based on the documented plan.

### Two-round planning for non-trivial tasks

For anything beyond a trivial edit, run the `planning-first` skill or the `/plan` prompt template before step 2:

- **Round 1 — Clarify**: ask 3–7 questions about intent, scope, constraints, and success criteria. No solutions yet. Read-only exploration is fine.
- **Round 2 — Propose**: restate the problem, offer 2–3 approaches with tradeoffs, surface assumptions, ask follow-up questions.
- **Commit** the plan to `TODO.md` or `docs/` only on explicit user authorization. **Build** only on explicit go-ahead.

Pair with `/readonly` when the user wants the permission gate to enforce no-writes during the rounds.

### Key properties

- Planning output is always captured as a file artifact, never lost in chat history
- The plan file is live context the agent can reference and update as it goes
- No explicit mode switching. The natural sequence (questions → document → implement) applies to every non-trivial task
- Trivial tasks (typos, small edits) can skip straight to implementation

### Permission model

The `permission-gate` extension controls tool access:

- **Default**: write/edit prompt for confirmation. Safe bash commands (ls, cat, git status, etc.) auto-allow. Sensitive file access always blocked.
- **`/readonly`**: blocks all writes and restricts bash to the read-only allowlist.
- **`/yolo`**: toggles skip-all-prompts mode. All write/edit/bash auto-allow. Sensitive files still blocked.
- **`/rules`**: shows active session permission rules (allow/deny rules set during the session).
- **`/reset-rules`**: clears all session rules and resets to default mode.

**Session rules**: after each prompt, a TUI selector asks whether to continue the pattern for the rest of the session: by tool type, directory, command pattern, or full yolo.

## Auto-Formatting

The `format-on-save` extension runs formatters automatically after every file write. Do not manually invoke formatters unless debugging a formatting issue.

Formatters in use:
- Prettier: `.js`, `.jsx`, `.ts`, `.tsx`, `.json`, `.css`, `.scss`, `.html`, `.md`, `.svelte`
- Ruff: `.py`, `.pyi`
- gofmt: `.go`
- gdformat: `.gd`
