---
name: planning-first
description: Two-round lightweight planning protocol before non-trivial work. Asks clarifying questions, then proposes approaches with tradeoffs, and only writes a plan artifact (TODO.md or docs/) on explicit instruction. Use at the start of any non-trivial task, when the user says "let's plan", "think about this first", "before we start", or invokes the /plan prompt template.
---

# Planning-First

A lightweight alternative to dedicated plan/act modes. No server, no mode switch, just a discipline for the first few turns of a task.

## When to use

- Any task that touches more than one file or introduces a new concept
- Anything where intent or scope is ambiguous
- When the user explicitly asks to plan, think first, or discuss before coding

Skip for trivial edits (typos, single-line fixes, obvious renames).

## Protocol

Run two rounds of conversation before any code or plan file is written.

### Round 1 — Clarify

Ask 3–7 clarifying questions. Cover:

- **Intent**: what problem is actually being solved?
- **Scope**: what is in and out of bounds?
- **Constraints**: deadlines, dependencies, compatibility, attack surface, performance.
- **Success criteria**: how will we know it works?
- **Ambiguities**: anything in the request that could be read two ways.

Do not propose solutions in Round 1. Stop and wait for answers.

Read-only exploration is allowed and encouraged (`read`, `ls`, `grep`, `lsp_navigation`, `ast_grep_search`) so questions are informed by the actual codebase.

### Round 2 — Propose

After the user answers:

1. Restate the problem in one or two sentences so framing is shared.
2. Offer 2–3 distinct approaches. For each, list tradeoffs across at least: complexity, risk, reversibility, attack surface, ongoing maintenance.
3. Surface remaining unknowns and assumptions explicitly.
4. Ask any second-round questions that only became answerable after Round 1.

Stop and wait again. If the user pushes back, loop back into Round 2 with revised options instead of jumping ahead.

### Commit

Only when the user explicitly authorizes ("write it up", "commit the plan", "save it", "yes do that"):

- **Small/medium** tasks → update `TODO.md` via the `todo-manager` skill.
- **Larger or design-heavy** tasks → write `docs/<topic>.md` containing:
  - Problem statement
  - Chosen approach
  - Rejected alternatives with reasons
  - Acceptance criteria
  - Open questions, if any

### Build

Only after explicit go-ahead ("build it", "implement", "go"), start editing code. Reference the committed plan artifact as you work and update it if the plan changes mid-flight.

## Rules

- No file writes or edits during Rounds 1 and 2.
- No destructive bash during Rounds 1 and 2.
- Pair naturally with `/readonly` if the user wants the permission gate to enforce the discipline.
- Keep round-by-round answers tight. The plan artifact is the place for prose, not the chat.

## Relationship to other tools

- **`/plan` prompt template**: the inline trigger for this protocol on a single task. The skill is the durable description; the template is the per-invocation kickoff.
- **`/readonly`**: optional belt-and-suspenders. The skill is behavioral; `/readonly` is enforced by the permission gate.
- **`todo-manager`**: the default commit target for small/medium plans.
