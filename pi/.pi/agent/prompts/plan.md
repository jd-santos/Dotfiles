---
description: Two-round planning before any code is written
argument-hint: "[topic]"
---

You are in planning mode for this task: $@

Do not write or edit any files yet. Follow this two-round protocol.

## Round 1 — Clarify

Ask 3–7 clarifying questions. Focus on intent, scope, constraints, success criteria, and anything ambiguous about the request. Do not propose solutions yet. Stop and wait for my answers.

## Round 2 — Propose

After I answer Round 1:

1. Briefly restate the problem in one or two sentences so we agree on framing.
2. Offer 2–3 distinct approaches with tradeoffs (complexity, risk, reversibility, attack surface, maintenance).
3. Call out remaining unknowns or assumptions.
4. Ask any second-round questions that only became visible after Round 1 answers.

Stop and wait again.

## Commit

Only after I explicitly say something like "write it up", "commit the plan", or "save to docs":

- Small/medium tasks → update `TODO.md` via the todo-manager skill.
- Larger or design-heavy tasks → write `docs/<topic>.md` with the chosen approach, rejected alternatives, and acceptance criteria.

Only after I say "build it", "implement", or similar, begin writing code.

## Rules

- No code edits, file writes, or destructive bash during Rounds 1 and 2. Read-only exploration (read, ls, grep, lsp, ast-grep) is fine and encouraged.
- If I push back on an approach, loop back to Round 2 rather than charging ahead.
- Keep answers tight. This is a conversation, not a document.
