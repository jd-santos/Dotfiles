---
name: offgrid-review
description: >-
  Build a portable, static HTML review console from deterministic JSON data plus
  an agent-authored spec, then run a separate safe apply pass on the exported
  decision JSON. Use when a review/triage/reconciliation task has many ambiguous
  items or document sections a human should review instead of explaining them
  one by one in chat. Examples include aligning two systems, inbox triage,
  classification, backlog prioritization, and LLM-authored plan review. The console is read-only by design: it captures decisions, and
  a verified apply pass makes changes later.
version: 1.1.0
author: jd-santos
category: workflow
allowed-tools: Bash(uvx --from git+https://github.com/jd-santos/offgrid-review.git offgrid-review *), Read
---

# Offgrid Review

Turn deterministic data plus human judgment into a portable review workbench
without a server or a long chat back-and-forth. The same console handles structured items, comparisons, sectioned queue items,
and complete planning documents built from semantic review blocks.

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
- LLM-authored plans that need section comments, visual inspection, and an
  explicit direction decision.
- Any "these items need a human verdict but I don't want to narrate each one in
  a chat thread" situation.

## When NOT to use

- Simple, few-item reviews. Just do them inline.
- Anything where decisions should be reached completely automatically (no human
  loop). No console is needed.
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

This is where the judgment goes: what should be asked this time. Add `title`,
`subtitle`, optional `agent_help`, optional `global_actions`, and either
`queues`, semantic `blocks`, or both.

Each queue defines its source, evidence fields, question, selection mode, and
actions. Document blocks compose overview, prose, table, flow, timeline,
dependency graph, chart, constrained SVG, and decision sections. Multi-select
is the default. Use single-select only for truly exclusive outcomes. Actions
can declare risk, reversibility, required rationale, exclusivity, and conflicts.

Prefer structured visual blocks over custom SVG. Every visual must retain its
visible text alternative. Custom SVG must pass the built-in allowlist sanitizer
and include title, description, and fallback text.

### 3. Generate the console

```bash
uvx --from git+https://github.com/jd-santos/offgrid-review.git offgrid-review \
  --data review-data.json \
  --spec review-spec.json \
  --out review.html
```

See `reference/usage.md` for the quickstart and custom-spec example. The
Python package has no third-party runtime dependencies. UVX is the recommended
acquisition and execution method, not a package dependency. Use
`uvx offgrid-review` after the first PyPI release.

### 4. Human reviews and exports decisions

Open the HTML, inspect the evidence, select every compatible action, and add
notes at the item, action, plan-section, or document-block level. Complete
planning documents receive responsive contents navigation automatically. The console stores review state
in `localStorage` when the viewer allows it and falls back to in-session state
otherwise. A visible warning tells the reviewer to download before closing.

### 5. Safe apply pass

Use the exported decision JSON to make changes, following `reference/apply-pass.md`:

- **Verify current state before mutating.** Re-fetch the item, then skip or
  re-ask if it changed since review.
- **Never do destructive actions unless explicitly approved** by the human's
  chosen action.
- **Treat `defer` / `needs human decision` / `ignore` as non-actions.** Never
  guess.
- **Report applied / skipped / error counts.**

## Deliverables in this skill

- `examples/review-spec.json`: multi-select, single-select, and plan review
  examples.
- `examples/review-data.json`: structured queue and sectioned-plan data.
- `examples/review-plan-spec.json`: semantic planning-document example.
- `examples/review-plan-data.json`: planning-document source data.
- `reference/artifact-contract.md`: data, spec, and export schemas.
- `reference/apply-pass.md`: the safe multi-action apply contract.
- `reference/usage.md`: setup, interaction behavior, and constraints.
- `PRODUCT.md`: product purpose, constraints, and principles.
- `DESIGN.md`: interface system and responsive behavior.

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
  a change, stop. That belongs in the apply pass, gated by the exported
  decisions.
- **The CLI is not the intelligence.** Frame new reviews by writing a new spec,
  not by changing the renderer. This skill is the agent discovery and workflow
  layer; the published CLI is the deterministic execution layer.
- **Use semantic blocks first.** Flow, timeline, dependency graph, and chart
  renderers provide deterministic visuals and text alternatives.
- **Never embed supplied SVG directly.** The generator must parse and serialize
  only its accepted subset. Rejected SVG shows an error plus the required text
  fallback, and its original source is omitted from annotation snapshots.
