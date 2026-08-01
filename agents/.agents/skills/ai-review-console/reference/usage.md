# AI Review Console — Usage & Quickstart

The provider-agnostic review console generator lives at
`scripts/review_console.py`. It needs no third-party packages (Python stdlib
only), so it runs anywhere Python 3 does.

## Quickstart

```bash
cd scripts

# 1. Peek at the example spec and data to copy the shape
cat review-spec.example.json
cat review-data.example.json

# 2. Generate a console from your data + spec
python3 review_console.py \
  --data my-data.json \
  --spec my-spec.json \
  --out my-review.html

# 3. Write a fresh generic spec to start from (won't overwrite an existing file)
python3 review_console.py --write-default-spec --spec my-spec.json

# 4. Open the HTML in a browser / any file viewer, tap through cards,
#    and Download JSON to get your decision approval artifact.
```

## The end-to-end loop

1. **Deterministic data script** snapshots the system under review to JSON
   (read-only). See [artifact-contract.md](artifact-contract.md#1-deterministic-data-json).
2. **Agent writes/edits the spec** to frame the questions for this review.
3. **`review_console.py`** turns data + spec into a static HTML console.
4. **Human reviews cards**, picks an action per card, optionally adds a note,
   and exports/downloads **decision JSON**.
5. **Apply pass** reads the decision JSON and makes changes — verifying current
   state first, skipping or re-asking on stale conflicts, and never doing
   unapproved destructive actions. See [apply-pass.md](apply-pass.md).

## Writing a custom spec

The spec is the whole point of the agent-flexibility design. You don't edit the
generator for a new review — you write a spec. Minimum viable spec:

```json
{
  "title": "My Review",
  "subtitle": "What will happen here.",
  "agent_note": "Why these queues/actions.",
  "global_actions": [
    { "id": "defer", "label": "Defer / ask later" }
  ],
  "queues": [
    {
      "id": "main_queue",
      "title": "Main queue",
      "description": "What we're deciding.",
      "source": "main_items",
      "empty": "Nothing to review.",
      "detail_keys": ["status", "priority", "due", "path", "description"],
      "primary_keys": ["status", "priority", "due"],
      "actions": [
        { "id": "approve", "label": "Approve" },
        { "id": "reject", "label": "Reject" }
      ]
    }
  ]
}
```

The data JSON must expose a key matching each queue's `source` (e.g.
`"main_items": [...]`) plus optional `date` and `counts`.

## Optional spec keys

The generator supports a few optional keys so a console can keep its identity
across regenerations without touching the engine. All are optional and default
to sensible generic behavior:

- Top-level:
  - `storage_key` (str) — override the browser `localStorage` key (default
    `reviewConsole:<title-slug>:v1`). Set this to preserve already-saved
    decisions when you change a title.
  - `download_prefix` (str) — override the downloaded-filename prefix (default
    `<title-slug>-decisions`). The filename becomes `<prefix>-YYYY-MM-DD.json`.
  - `note_label` (str) — text shown above each card's note box (default
    `Note / rationale`).
  - `agent_help` (str) — replace the "How this works" sentence in the header
    (default: generic instruction to download decision JSON and send it to
    the agent).
  - `payload_meta` (object) — extra static keys merged into the exported
    decision JSON (e.g. `{"generated_from": "scripts/foo.py"}`).
- Per queue:
  - `detail_keys` (list) — which item fields render as property blocks
    (default: `status, priority, due, path, description`).
  - `primary_keys` (list) — which detail fields get emphasized styling
    (default: `status, priority, due`). Matching is suffix-based, so
    prefixed labels like `Todoist priority` still highlight.
  - `side_labels` (list) — for a queue whose items are two-dict lists (a
    side-by-side comparison), prefixes each side's detail labels (e.g.
    `["Todoist", "Obsidian"]`).

## Common review domains

- Reconciliation / alignment between two systems (e.g. project manager ↔ task
  list)
- Inbox / triage queues
- Classification or labeling tasks
- Backlog prioritization
- Anything with 20–100+ ambiguous items that would be painful to walk through
  one by one in chat

## Open questions / roadmap (general, not instance-specific)

These stay general and reusable, independent of any one domain:

- What minimal schema should all decision consoles share?
- Should downloaded decision JSON have a standard import/apply command?
- Should future hosted versions save decisions directly (e.g. over Tailscale)?
- How should Telegram/chat delivery be standardized for the HTML + JSON loop?

## Pitfalls

- **JSON embedded in the console must stay literal JSON.** The generator already
  handles this, but if you fork it, never HTML-entity-escape the contents of a
  `<script type="application/json">` block — browsers don't decode entities in
  raw-text script contents and `JSON.parse()` will fail on every click. Only
  neutralize a literal closing `</script>` sequence.
- **Some file viewers block `localStorage`** (Telegram, some iOS viewers). The
  generator wraps storage in `try`/`catch` so choices still work in-session; the
  page shows a badge if storage is unavailable so the human knows to download
  the JSON before closing.
- **Generator never mutates anything.** If you need changes made, that's the
  apply pass — not the console, and not the generator.
