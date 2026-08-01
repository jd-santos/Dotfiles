---
name: ai-review-console
description: >-
  Build a portable, static HTML review console from deterministic JSON data plus
  an agent-authored spec, then run a separate safe apply pass on the exported
  decision JSON. Use when a review/triage/reconciliation task has many ambiguous
  items a human should tap through instead of explaining one-by-one in chat —
  anything from aligning two systems to inbox triage, classification, or backlog
  prioritization. The console is read-only by design: it captures decisions, and
  a verified apply pass makes changes later.
version: 1.0.0
author: jd-santos
category: workflow
allowed-tools: Bash(python3 **/scripts/review_console.py *), Read
---

# AI Review Console

Turn deterministic data plus human judgment into a portable, tappable review
surface without a server or a long chat back-and-forth.

The pattern:

```text
deterministic data script → agent-authored review spec → static HTML console
    → human exports decision JSON → safe apply pass
```

Use it when there are 20–100+ ambiguous items that would be painful to walk
through one at a time in chat, and where the right decision needs a human in the
loop but the facts can be gathered deterministically first.

## When to use

- Reconciliation or alignment between two systems (e.g. a project/planning store
  and a task/reminder list).
- Inbox / triage / backlog queues.
- Classification or labeling tasks.
- Backlog prioritization.
- Any "these items need a human verdict but I don't want to narrate each one in
  a chat thread" situation.

## When NOT to use

- Simple, few-item reviews — just do them inline.
- Anything where decisions should be reached completely automatically (no human
  loop) — no console needed.
- Work that itself is not safe to separate into "review now, apply later." If a
  change must happen the moment it's decided, this pattern adds needless
  friction.

## Core principle: review and apply are SEPARATE

The console is a **decision-capture** surface, never an **apply** surface.
Nothing is changed from the page on purpose. A human reviews and exports
decision JSON, then a separately-verified pass actually makes changes. Never
let the console (or the generator) mutate the underlying system.

## Workflow

### 1. Gather deterministic data (JSON)

Write or use a read-only script that snapshots the current state of the system
under review and emits JSON:

```json
{
  "date": "2026-08-01",
  "counts": { "main_items": 3 },
  "main_items": [
    { "id": "a", "title": "Item A", "status": "Ready", "priority": "p1" }
  ]
}
```

Requirements: read-only, deterministic-enough to re-run, explicit source IDs on
each item, and enough raw data captured that the apply pass can find items
again. See `reference/artifact-contract.md` for the full shape.

### 2. Write the agent-authored spec (JSON)

This is where the judgment goes — what should be asked this time. Add `title`,
`subtitle`, `agent_note`, optional `global_actions`, and one or more `queues`.
Each queue has `id`, `title`, `description`, `source` (matching a data JSON
key), `empty`, `detail_keys`, `primary_keys`, and `actions`.

### 3. Generate the console

```bash
python3 scripts/review_console.py \
  --data review-data.json \
  --spec review-spec.json \
  --out review.html
```

See `reference/usage.md` for the quickstart and custom-spec example. No
third-party dependencies — Python stdlib only.

### 4. Human reviews and exports decisions

Open the HTML, tap a decision per card (optionally adding a note), then download
the decision JSON. The console stores choices in `localStorage` when the viewer
allows it and falls back to in-session decisions otherwise (with a visible
warning to download before closing).

### 5. Safe apply pass

Use the exported decision JSON to make changes, following `reference/apply-pass.md`:

- **Verify current state before mutating** — re-fetch the item; skip or re-ask
  if it changed since review.
- **Never do destructive actions unless explicitly approved** by the human's
  chosen action.
- **Treat `defer` / `needs human decision` / `ignore` as non-actions** — never
  guess.
- **Report applied / skipped / error counts.**

## Deliverables in this skill

- `scripts/review_console.py` — the generator (stdlib only).
- `scripts/review-spec.example.json` — generic spec you can copy/adapt.
- `scripts/review-data.example.json` — sample deterministic data.
- `reference/artifact-contract.md` — the shared data/spec/decision shapes.
- `reference/apply-pass.md` — the safe apply pass contract.
- `reference/usage.md` — quickstart, custom spec, pitfalls.

## Pitfalls

- **Keep embedded JSON literal.** The generator neutralizes closing
  `</script>` sequences; never HTML-entity-escape the `<script
  type="application/json">` blocks (raw-text script content doesn't decode
  entities, so `JSON.parse()` fails and every click breaks).
- **Storage blockers.** Telegram / some iOS / local-file viewers block
  `localStorage`. Initialization and persistence must stay inside
  `try`/`catch` so session interactions still work, and the UI must tell the
  human to download JSON when storage is unavailable.
- **Don't drift into an apply surface.** If you find the console "just applying"
  a change, stop — that belongs in the apply pass, gated by the exported
  decisions.
- **The generator is not the intelligence.** Frame new reviews by writing a new
  spec, not by editing the generator.
