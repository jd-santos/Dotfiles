# Offgrid Review Safe Apply Pass

The console captures approval. It does not apply changes. A separate pass reads
the exported JSON, verifies live state, and performs only the approved actions.

## Before applying

Require all of the following:

- A human delivered the exported decision JSON.
- `valid` is `true`, or a human explicitly resolved each warning.
- The apply implementation understands every selected action ID.
- Annotation-only entries, including document-block comments, are not treated
  as decisions.

An incomplete export may still contain approved decisions, but the apply pass
must report that the review was partial.

## Core rules

1. Verify current state before every mutation. Re-fetch the item identified by
   the embedded snapshot.
2. Skip or re-ask when the live item is missing or materially different.
3. Apply every compatible action in `decision.actions`, in a deterministic
   order defined by the apply implementation.
4. Never infer an action from prose or annotations.
5. Require explicit selection for destructive operations.
6. Treat defer, needs-review, ignore, and similar outcomes as non-actions unless
   the domain contract defines a concrete safe operation.
7. Report applied, skipped, stale, and failed actions separately.

## Safe loop

```text
for each decision in decisions:
    reviewed = decision.item
    live = fetch_current(reviewed)

    if live is missing or changed materially:
        mark every selected action as skipped-stale
        continue

    actions = decision.actions
    if actions is absent and decision.action is present:
        actions = [{ id: decision.action }]  # legacy export

    validate actions are known, compatible, and explicitly selected

    for each action in deterministic domain order:
        if action is destructive:
            require exact action ID approval
        apply action to the latest verified state
        record applied, skipped, or failed result

report item and action totals
```

Re-fetch between actions when one action can change the assumptions used by the
next. Prefer idempotent operations so a retry does not duplicate work.

## Notes and rationale

- `decision.note` is the legacy item-level note.
- `decision.notes.item` is the canonical item-level note.
- `decision.notes.actions[action_id]` carries rationale for one action.
- `decision.notes.sections[section_id]` carries plan feedback.
- Top-level `annotations` contains feedback with no approved action. Document
  block annotation IDs use `<document_id>:<block_id>` and may carry a block
  snapshot in `item`.
- Custom SVG source is intentionally omitted from block snapshots. The fallback
  and surrounding block metadata remain available.

Notes guide interpretation. They do not authorize additional mutations. A plan
comment can inform later revision work, but it cannot authorize an apply action
that the reviewer did not select.

## Deterministic and agent-driven apply

A deterministic script works well for high-volume, well-understood actions. An
agent-driven pass works for interpretive changes. Both must enforce the same
verification boundary and produce the same concrete result report.

## Failure handling

- Stale snapshot: skip and report the changed fields.
- Unknown action: stop that decision and ask for an updated apply mapping.
- Conflicting actions: do not choose one silently.
- Missing required rationale: stop the affected action.
- Partially failed multi-action decision: report each action result and the
  final live state.
- Annotation-only item or document block: preserve or report the feedback, but
  do not mutate.
