# Offgrid Review Usage

The `offgrid-review` Python CLI uses only the standard library at runtime. It
writes one offline HTML file with embedded styles, behavior, and review data.
PyPI distributes the package, and UVX is the recommended runner.

## Quickstart

```bash
uvx --from git+https://github.com/jd-santos/offgrid-review.git offgrid-review \
  --data review-data.json \
  --spec review-spec.json \
  --out review.html

# Write a generic starting spec to a new path.
uvx --from git+https://github.com/jd-santos/offgrid-review.git offgrid-review \
  --write-default-spec \
  --spec my-review-spec.json
```

Open `review.html`, record decisions, then download or copy the exported JSON.
Send that file to the separate apply pass.

Generate the checked-in planning-document example from the repository root:

```bash
uvx --from git+https://github.com/jd-santos/offgrid-review.git offgrid-review \
  --data skills/offgrid-review/examples/review-plan-data.json \
  --spec skills/offgrid-review/examples/review-plan-spec.json \
  --out review-plan.html
```

This second example uses the same engine, persistence, summary, and export model
as the queue example. UVX fetches the package on first use and then reuses its
cached environment. After the first PyPI release, use `uvx offgrid-review` or
`uv tool install offgrid-review` when the command should remain installed before
a machine goes offline.

## Workflow

1. A read-only script snapshots deterministic source data as JSON.
2. An agent writes the review spec for the current question.
3. `offgrid-review` creates the static console.
4. A human selects actions and adds notes.
5. The console exports decision JSON.
6. The apply pass re-fetches live state before making approved changes.

See [artifact-contract.md](artifact-contract.md) for schemas and
[apply-pass.md](apply-pass.md) for the safety boundary.

## Minimal spec

Actions are multi-select by default:

```json
{
  "title": "My Review",
  "subtitle": "Review proposed changes. Nothing is applied from this page.",
  "global_actions": [
    {
      "id": "defer",
      "label": "Defer for later",
      "exclusive": true
    }
  ],
  "queues": [
    {
      "id": "main",
      "title": "Main queue",
      "description": "Select every compatible follow-up.",
      "source": "main_items",
      "question": "Which actions should be taken?",
      "selection_mode": "multiple",
      "detail_keys": ["status", "priority", "description"],
      "primary_keys": ["status", "priority"],
      "actions": [
        {
          "id": "accept",
          "label": "Accept the proposal",
          "description": "Carry the proposed values into the apply pass."
        },
        {
          "id": "request_changes",
          "label": "Request changes",
          "requires_note": true,
          "conflicts_with": ["accept"]
        }
      ]
    }
  ]
}
```

The data JSON needs a matching source key:

```json
{
  "date": "2026-08-01",
  "main_items": [
    {
      "id": "item-a",
      "title": "Example item",
      "status": "Ready",
      "priority": "p1"
    }
  ]
}
```

## Selection behavior

Use `selection_mode: "multiple"` unless the domain permits exactly one answer.
The console renders native checkboxes and lets compatible actions coexist.

Use `selection_mode: "single"` for a truly exclusive queue. The console renders
native radio controls.

An action can also set `exclusive: true`. Selecting it clears other actions on
the same item. Global fallback actions are exclusive by default.

Use `conflicts_with` to declare invalid combinations without silently choosing
for the reviewer:

```json
{
  "id": "approve",
  "label": "Approve",
  "conflicts_with": ["request_changes"]
}
```

Conflicts remain visible and make the export invalid until resolved.

## Action metadata

Actions support:

- `description`: visible explanation under the label.
- `risk`: `low`, `medium`, or `high`.
- `reversible`: boolean.
- `requires_note`: require item-level or action-level rationale.
- `exclusive`: clear other selections when chosen.
- `conflicts_with`: action IDs that cannot coexist.

High-risk and irreversible actions use a muted plum risk treatment. Risk never
uses the blush selection color. Red remains reserved for validation errors and
urgent danger.

## Granular notes

Every item includes a general note. Each action includes a progressively
revealed note field. Queue-item plan sections and top-level document blocks
receive their own comment controls when they have stable IDs.

The exported entry contains:

```json
{
  "note": "legacy item-level alias",
  "notes": {
    "item": "general context",
    "actions": { "request_changes": "specific rationale" },
    "sections": { "flow": "section feedback" }
  }
}
```

Feedback with no selected action is exported in the top-level `annotations`
array. It is not approval to mutate the item or document.

## Queue-item plan sections

A dictionary item can include structured sections:

```json
{
  "id": "plan-a",
  "title": "Draft workflow",
  "status": "Draft",
  "sections": [
    {
      "id": "goal",
      "title": "Goal",
      "body": "Describe the intended outcome."
    },
    {
      "id": "checks",
      "title": "Checks",
      "kind": "table",
      "columns": ["State", "Response"],
      "rows": [["Conflict", "Resolve before export"]]
    },
    {
      "id": "flow",
      "title": "Review flow",
      "kind": "diagram",
      "nodes": [
        { "id": "inspect", "title": "Inspect" },
        { "id": "decide", "title": "Decide" }
      ],
      "edges": [
        { "from": "Inspect", "to": "Decide" }
      ]
    }
  ]
}
```

Section prose is treated as plain text. Tables and diagram structures are
escaped and rendered without third-party JavaScript.

## Planning-document review

Use top-level semantic `blocks` when the whole artifact should read like a
document instead of a queue card:

```json
{
  "title": "Release Proposal",
  "subtitle": "Review the plan and return a direction decision.",
  "document_id": "release_plan",
  "document_title": "Planning proposal",
  "document_description": "Review the proposal in order.",
  "blocks": [
    {
      "type": "overview",
      "id": "overview",
      "source": "plan.overview"
    },
    {
      "type": "flow",
      "id": "delivery_flow",
      "source": "plan.flow"
    },
    {
      "type": "decision",
      "id": "direction",
      "title": "Direction decision",
      "question": "What should happen with this proposal?",
      "actions": [
        { "id": "approve", "label": "Approve the direction" },
        {
          "id": "revise",
          "label": "Request revisions",
          "requires_note": true,
          "conflicts_with": ["approve"]
        }
      ]
    }
  ],
  "queues": []
}
```

Supported block types are `overview`, `prose`, `decision`, `table`, `flow`,
`timeline`, `dependency_graph`, `chart`, and `svg`. A block can define content
inline or use a dot-separated `source` path into the data JSON. Explicit spec
fields override source fields.

Choose the block that matches the review question. Use flow for ordered stages,
timeline for dated or sequenced events, dependency graph for relationships, and
chart only for quantitative comparisons. Tables remain the best default for
precise side-by-side values.

### Visual alternatives

Generated flows include ordered steps and connection statements. Dependency
graphs include node descriptions and dependency statements. Charts include a
source-value table. These alternatives stay in visible disclosures immediately
below each visual.

### Custom SVG

Use `svg` only when the structured visual types cannot express the content. A
custom SVG block requires:

- `svg` containing a positive `viewBox`, `title`, and `desc`.
- `fallback` as text or a list of text statements.
- Markup limited to the generator's element, attribute, color, transform, size,
  and complexity allowlists.

The generator parses and serializes accepted SVG. It rejects scripts, handlers,
links, images, animation, filters, masks, patterns, embedded HTML, styles,
external references, unknown namespaces, and oversized input. A rejected
visual shows an error and preserves the required fallback. Original custom SVG
source is not copied into annotation snapshots.

See `examples/review-plan-spec.json` and `examples/review-plan-data.json` for a
complete document demo.

## Review navigation

The workbench includes:

- Queue navigation and per-queue progress.
- **On this page** links for semantic documents, with current-section state.
- A floating list control at 1120 pixels and below that opens a nonmodal
  contents drawer above the mobile action tray.
- Document-only navigation that omits irrelevant item search and filters.
- Search over titles, evidence, and action labels.
- Queue and resolved-state filters.
- Previous and next unresolved controls.
- `/` to focus search.
- `J` and `K` to move between unresolved items.
- A mobile action tray that follows the current item.
- A nonmodal review summary.

Native controls, visible focus, semantic field grouping, live status messages,
and reduced-motion support are built in.

## Themes

The console follows the system theme by default. **Review file details** offers
explicit System, Light, and Dark choices. The override uses browser storage when
available. Both themes keep blush for selection and annotation, muted plum for
risk, and red for validation errors or urgent danger.

## Summary and export

The summary reports:

- Resolved and unresolved items.
- Counts by selected action.
- High-risk and irreversible actions.
- Conflicts.
- Missing required rationale.
- Items containing notes.

Export is gated when any warning remains. The reviewer can still export from
the summary, but the JSON preserves `complete`, `valid`, and `warnings` so the
apply pass cannot mistake a partial or invalid review for a clean one.

`actions` is the canonical selected-action array. When there is exactly one
selection, `action` and `label` are also populated for older apply scripts.

## Optional top-level keys

- `storage_key`: browser storage key override.
- `download_prefix`: downloaded filename prefix.
- `note_label`: item-note label.
- `agent_help`: short visible workflow instruction.
- `document_id`, `document_title`, `document_description`: planning-document
  framing.
- `blocks`: semantic document sections.
- `payload_meta`: static fields merged into the export.
- `language`: HTML language code.

## Optional queue keys

- `question`: decision prompt.
- `selection_mode`: `multiple` or `single`.
- `selection_hint`: help under the prompt.
- `detail_keys`: item fields to render.
- `primary_keys`: fields visible before supporting details expand.
- `side_labels`: labels for two-record comparisons.
- `empty`: empty-queue message.

## File-viewer constraints

Some Telegram, iOS, and local-file viewers block `localStorage` or clipboard
access. The console catches those failures, keeps the current session usable,
and tells the reviewer to download before closing. Copy falls back to an inline
JSON preview.

The generated file never calls an API or applies a decision. If a workflow
needs mutation, implement it in the verified apply pass.
