# Offgrid Review Artifact Contract

The console uses four artifacts:

```text
deterministic data JSON + agent-authored review spec
    -> static HTML console
    -> exported decision JSON
    -> separately verified apply pass
```

Keeping these shapes stable lets the same generator handle reconciliation,
classification, backlog review, and complete planning-document feedback.

## 1. Deterministic data JSON

Top-level shape:

```json
{
  "date": "2026-08-01",
  "counts": { "main_items": 3, "plan_items": 1 },
  "main_items": [{ "id": "item-a", "title": "Example" }],
  "plan_items": [{ "id": "plan-a", "title": "Draft plan" }]
}
```

Rules:

- Data collection is read-only.
- Each queue item has a non-empty `id`. A two-record comparison uses an array
  of objects where every object has a non-empty `id`.
- The snapshot includes enough raw state for the apply pass to detect changes.
- Factual collection stays separate from agent recommendations.
- Each queue's `source` matches one top-level array key.
- A document block's `source` may use a dot-separated path into nested data,
  such as `plan_document.overview`.

The optional `counts` object appears as review-file metadata. Counts that match
a queue source and total are suppressed because queue navigation already shows
them.

## 2. Agent-authored review spec

The spec frames the current review. The generator is not the intelligence.

### Top-level fields

- `title`: reviewer-facing title.
- `review_id`: optional stable namespace for browser state and exports. The
  title slug is used when this is omitted.
- `subtitle`: short context exposed through the header's **About** control.
- `agent_help`: optional replacement for the visible workflow instruction.
- `document_id`, `document_title`, `document_description`: document-mode
  identity and framing.
- `blocks`: optional semantic planning-document sections.
- `global_actions`: outcomes available on every queue item and document
  decision.
- `note_label`: label for the item-level note.
- `storage_key`: optional browser-storage namespace override. The schema
  version and review ID are appended.
- `download_prefix`: optional decision filename prefix.
- `payload_meta`: static fields copied into the export. It cannot replace
  canonical identity, validity, decision, annotation, or timestamp fields.
- `language`: HTML language code, default `en`.
- `queues`: zero or more review groups. A spec must provide `queues`, `blocks`,
  or both.

### Queue fields

Each queue supports:

- `id`: stable slug and in-page anchor.
- `title`, `description`: queue framing.
- `source`: matching data JSON key.
- `empty`: message for an empty queue.
- `question`: decision prompt.
- `selection_mode`: `multiple` by default, or `single` for a truly exclusive
  choice.
- `selection_hint`: optional instruction below the question.
- `detail_keys`: item fields shown as evidence.
- `primary_keys`: fields kept visible before supporting details are expanded.
- `side_labels`: optional labels for two-record comparisons.
- `actions`: queue-specific decisions.

### Action fields

Every action requires `id` and `label`. Optional fields are:

- `description`: visible explanation of the effect.
- `risk`: `low`, `medium`, or `high`.
- `reversible`: boolean.
- `requires_note`: require rationale before a valid export.
- `exclusive`: selecting this action clears other selections on the item.
- `conflicts_with`: action IDs that cannot be exported with this action.

Global actions default to `exclusive: true`. Action IDs must be unique within a
card, and a local action cannot reuse a global action ID on the same surface.
Every `conflicts_with` reference must resolve to an available action.

### Item plan sections

A queue item can include a `sections` array for the older card-contained plan
presentation. Every section accepts:

- `id`: stable annotation target.
- `title`: visible heading.
- `body` or `content`: plain-text prose.
- `kind: "table"`, with `columns` and `rows`.
- `kind: "diagram"` or `"graph"`, with `nodes` and `edges`.

Diagram nodes can be strings or objects with `id`, `title`, and `description`.
Edges can be objects with `from`, `to`, and optional `label` fields. The
renderer keeps the structure readable without scripts or network assets.

### Semantic document blocks

Top-level `blocks` compose a complete document. Every block supports:

- `type`: one of `overview`, `prose`, `decision`, `table`, `flow`, `timeline`,
  `dependency_graph`, `chart`, or `svg`.
- `id`: stable annotation or decision target.
- `title`: visible section heading.
- `source`: optional dot-separated path into the data JSON. Values from the
  source object merge with the block spec, and explicit spec fields win.

Type-specific fields:

- `overview`: `body` or `content`, plus optional `points`.
- `prose`: `body` or `content` as escaped plain text. Paragraphs are separated
  by blank lines.
- `decision`: `question`, `selection_mode`, `selection_hint`, and `actions`.
  It uses the same action contract as queue decisions.
- `table`: `columns` and `rows`.
- `flow`: `nodes` and directed `edges`.
- `timeline`: `events`, where each event may contain `step` or `date`, `title`,
  and `description`.
- `dependency_graph`: `nodes`, directed `edges`, and optional numeric `level`
  on each node for deterministic columns.
- `chart`: `chart_type` (`bar` or `line`), `values`, and optional `unit`. Each
  value contains `label` and a non-negative numeric `value`.
- `svg`: `svg` markup plus required `fallback` text or string list.

Flow, dependency graph, and chart renderers generate SVG from structured JSON.
Each includes a visible text alternative. Charts include their source-value
table. Custom SVG must include `title`, `desc`, and a positive `viewBox`, then
pass a strict element and attribute allowlist. The sanitizer rejects scripts,
event handlers, links, images, animation, embedded HTML, filters, masks,
patterns, external resources, style attributes, unknown namespaces, excessive
source size, excessive elements, and excessive path data. Accepted markup is
parsed and reserialized. Original SVG source is omitted from block annotation
snapshots.

Every non-decision document block receives a stable block comment. Comments
with no action remain annotation-only feedback.

## 3. Static HTML console

After creating the data and specification described above, generate the console
from Git while `0.1.0` is being prepared:

```bash
uvx --from git+https://github.com/jd-santos/offgrid-review.git offgrid-review \
  --data review-data.json \
  --spec review-spec.json \
  --out review.html
```

This Git-source command is temporary. Use `uvx offgrid-review` after
publication. Exact version pins are only needed for reproducibility.

Properties:

- One offline file with embedded CSS, JavaScript, data, and review framing.
- Embedded schema, generator, review, data, specification, and artifact identity.
- Apache-2.0-licensed output runtime and templates, with the required license
  and notice carried inside the file.
- No external-system writes.
- Native checkbox and radio controls with semantic grouping.
- Item, action, plan-section, and document-block annotations.
- Accessible on-demand review context beside the title.
- One visually dominant header action, with theme selection in review-file
  details.
- System, light, and dark theme selection.
- Queue navigation, search, state filters, progress, and keyboard shortcuts.
- Stable document-block anchors and responsive contents navigation. Document-only
  reviews omit item-specific queue, search, and state controls.
- Local browser persistence when available, with session-only fallback.
- Summary and validation before copy or download.

The default storage key is `offgridReview:v<schema_version>:<review_id>`.
Stored data uses an envelope containing the schema version, artifact
fingerprint, and decisions. The page ignores an envelope from another schema or
artifact, filters unknown item and action IDs, and shows a recovery message.
Pre-release title-only storage is not migrated.

## 4. Decision JSON

Example export:

```json
{
  "schema_version": 1,
  "generator_version": "0.1.0",
  "review_id": "my-review",
  "data_fingerprint": "sha256:...",
  "spec_fingerprint": "sha256:...",
  "artifact_fingerprint": "sha256:...",
  "console_title": "My Review",
  "exported_at": "2026-08-01T12:00:00.000Z",
  "complete": true,
  "valid": true,
  "warnings": [],
  "decisions": [
    {
      "id": "main:item-a",
      "queue": "main",
      "actions": [
        { "id": "accept", "label": "Accept the proposal" },
        { "id": "add_follow_up", "label": "Add a follow-up" }
      ],
      "action": null,
      "label": null,
      "note": "General rationale",
      "notes": {
        "item": "General rationale",
        "actions": { "add_follow_up": "Track this separately" },
        "sections": {}
      },
      "item": { "id": "item-a", "title": "Example" },
      "decided_at": "2026-08-01T11:30:00.000Z",
      "updated_at": "2026-08-01T11:35:00.000Z"
    }
  ],
  "annotations": []
}
```

`schema_version` identifies the decision contract. `generator_version` records
the package that produced it. The data and specification fingerprints are
SHA-256 hashes of canonical JSON using sorted object keys, UTF-8, no
insignificant whitespace, and non-ASCII characters left literal. `artifact_fingerprint` hashes a canonical object
containing `schema_version`, `data_fingerprint`, and `spec_fingerprint`. An
apply implementation must reject unsupported schemas instead of guessing.

`actions` is canonical. For compatibility with older apply scripts, `action`
and `label` are populated when exactly one action is selected. Both are `null`
for a multi-action decision.

`complete` means every item has at least one selected action. `valid` means no
selected action conflicts or required rationale notes remain. `warnings`
explains incomplete, risky, or invalid states.

Notes on items or document blocks without a selected action are exported
separately in `annotations`. Document block annotation IDs use
`<document_id>:<block_id>`. Their `item` snapshot contains the block metadata
and content, except original custom SVG source. Apply code must not treat any
annotation entry as approval.

`complete` counts queue items and document decision blocks. Informational
blocks and annotation-only feedback do not make a review incomplete.

The HTML and decision export contain source snapshots. Fields hidden behind a
disclosure remain present in the file. Preparers must exclude secrets and
unrelated private data before generation.
