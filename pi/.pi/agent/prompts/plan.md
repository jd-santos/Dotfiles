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

## Save

Only after I explicitly say something like "write it up", "commit the plan", or "save it", load `todo-manager` and save the agreed plan. Respect existing queue locations until migration is authorized. In a new or migrated workbench:

- Small tasks → update `todo/TODO.md` under a P1–P5 priority heading.
- Substantial tasks → link `todo/work/<descriptive-name>/README.md` from the index. Keep its execution checklist, acceptance criteria, status, and ownership there.
- Design-heavy tasks → add `plan.md` in that work folder only when needed, with the chosen approach, rejected alternatives and reasons, and links to acceptance criteria.

Keep one current plan and one detailed checklist. Agree on disjoint scope before parallel implementation; ownership notes are not locks across worktrees.

Only after I say "build it", "implement", or similar, begin writing code. An implementation go-ahead after agreement also authorizes saving the agreed plan first. Saving a plan does not itself authorize a Git commit.

## Rules

- No code edits, file writes, or destructive bash during Rounds 1 and 2. Read-only exploration (read, ls, grep, lsp, ast-grep) is fine and encouraged.
- If I push back on an approach, loop back to Round 2 rather than charging ahead.
- Keep answers tight. This is a conversation, not a document.
