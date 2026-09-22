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

When working on multi-step tasks, or when the user mentions todos, load the `todo-manager` skill. New workbenches use root-level `todo/`; respect existing project conventions and migrate legacy queues only with authorization. Read-only planning rounds do not authorize task writes.

Active responsibilities:

- If a repository has root `TODO.md` but no `todo/TODO.md`, keep using that legacy queue until migration is explicitly authorized.
- Maintain `todo/TODO.md` as a P1: Rush, P2: High, P3: Essential, P4: Low, P5: Minor priority index in new or migrated workbenches.
- Keep small checklists inline; larger work uses a stable `todo/work/<descriptive-name>/README.md` with one detailed checklist and links to supporting material
- Agree on disjoint scope for concurrent agents; keep one writer per checkout, use separate worktrees, and reconcile shared index edits through the coordinator or integrator
- Check completed steps in place; remove only ready scope during reviewed shipping closeout, without a Done task ledger
- Keep `todo/README.md` as the human introduction and map; `todo/DONE.md` links to Git, PRs, the existing changelog, and retained evidence, with optional selected release highlights
- Preserve useful evidence, resolve obsolete guidance, and ask before deleting artifacts; do not load retained work wholesale as current instructions
- Proactively flag high-priority issues discovered while working (limit: 1-2 suggestions per session)

### Context-Aware Planning

The `context-planner` extension injects a hidden `<context-planning-advisory>` after each user prompt. Treat its token count and percentage as planning inputs when deciding scope and tool calls for that agent run.

Use these thresholds:

- Below 50%: Work normally. Keep newly discovered future work divisible into bounded packets.
- At 50%: Recommend finishing the current coherent unit and documenting the remaining work instead of expanding scope.
- Between 50% and 80%: Increasingly favor bounded work, wrap-up, and handoff preparation as usage approaches the ceiling.
- At 80%: Do not start new work. Only make small fixes needed to leave the project coherent and prepare the handoff.

Group future-agent and future-subagent work into one of these types:

- Focused change
- Subsystem or file cluster
- Exploratory research
- Future-subagent packet

Add only a coarse context estimate to each planned packet:

- `[context: small]`: expected to use up to 10% of a context window
- `[context: medium]`: expected to use more than 10% and up to 25%
- `[context: large]`: expected to use more than 25% and up to 40%

Split work expected to exceed 40% into smaller packets. Do not execute future-subagent packets automatically.

The task index points to durable work records. When a handoff is actually prepared, update the existing work README with remaining steps, blockers, validation, and links; for small inline tasks, keep the handoff under the task. Record `Handoff prepared at ~N% context` there when usage is known, without generating a separate dated handoff document. The advisory alone does not authorize task edits, compaction, session switching, or subagent execution.

If usage is unavailable immediately after compaction, treat capacity as unknown. Do not infer that the context is empty, and do not stop solely because telemetry is unavailable.

## Subagent Orchestration

Keep the parent session as the sole orchestrator. Do not let child agents launch
additional agents unless the user explicitly approves a bounded exception.

Use the persistent FleetView and automatic completion or attention notices for
progress. Do not call subagent `status` or `list` automatically while work is
active. A status call is appropriate only when the user asks, a completion is
required at the next dependency barrier and automatic delivery did not arrive,
or an attention or recovery signal requires inspection. Manual
`/subagents-fleet` inspection remains available at any time.

After a substantial implementation, launch two fresh reviewers in parallel with
distinct scopes:

1. A correctness reviewer checks behavior, regressions, edge cases, tests, and
   validation evidence.
2. A design reviewer checks scope, architecture, maintainability, complexity,
   project conventions, and documentation effects.

An implementation is substantial when it changes architecture, schemas,
persistence, public or security-sensitive behavior, materially changes multiple
source files, or needs a meaningful test plan. Do not launch routine reviewers
for typo fixes, documentation-only corrections, or small configuration edits
unless requested.

After fixes, run at most one follow-up review round and only when the diff changed
materially. Re-run only the reviewer whose findings were affected, or both when
both review scopes changed.

## Documentation and Prose

When drafting, rewriting, or polishing prose or copyable text, load and follow the `core-writing` skill. Also load `technical-writing` for documentation, code comments, READMEs, technical explanations, specs, or agent instructions.

Core requirements from `core-writing`:

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

2. **Write docs second.** Save the agreed plan before implementing; saving does not itself authorize a Git commit. Planning output must not live only in chat. Use the `todo-manager` skill to locate the existing queue. In a new or migrated workbench:
   - `todo/TODO.md` for the priority index and small inline tasks
   - `todo/work/<descriptive-name>/README.md` for substantial work, its checklist, and handoff
   - A linked `plan.md` in that work folder when the design needs its own document
   - Maintained project docs for enduring reference material, not competing working plans

3. **Write code third.** Implement based on the documented plan.

### Two-round planning for non-trivial tasks

For anything beyond a trivial edit, run the `planning-first` skill or the `/plan` prompt template before step 2:

- **Round 1 — Clarify**: ask 3–7 questions about intent, scope, constraints, and success criteria. No solutions yet. Read-only exploration is fine.
- **Round 2 — Propose**: restate the problem, offer 2–3 approaches with tradeoffs, surface assumptions, ask follow-up questions.
- **Save** the plan in the task workbench only on explicit user authorization. **Build** only on explicit go-ahead. An implementation go-ahead after agreement also authorizes saving the agreed plan first.

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
