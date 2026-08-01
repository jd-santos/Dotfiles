# AI Review Console — The Safe Apply Pass

The console is a **decision-capture** surface, never an **apply** surface.
Nothing is changed from the HTML page on purpose. The boundary between "review"
and "apply" is a real safety feature: a human reviews and exports decisions,
then a separate, verified pass actually makes changes. This doc defines how that
apply pass should behave.

## When to use this

Only after a human has reviewed a console and exported the **decision JSON**.
Running the apply pass on decisions that were never approved is a bug. The
exported JSON is the approval artifact.

## Core rules

1. **Verify current state before mutating.** The decision embeds a raw item
   snapshot taken when the human reviewed it. Before touching the live system,
   re-fetch the current state of that item. If it has changed since the review,
   stop — do not blindly apply against stale data.
2. **Skip or re-ask on stale conflicts.** If the target no longer exists, or its
   state contradicts the decision's premise, safe actions are: skip and record,
   or re-ask the human. Never force a decision through.
3. **Avoid destructive actions unless explicitly approved.** Close/delete/
   unlink/reset-type actions must be gated on the human having explicitly picked
   them. Read the decision's `action` value, don't guess from prose.
4. **Respect the decision's scope.** Apply exactly the action chosen for that
   queue. A global fallback like "defer" or "needs human decision" is NOT a
   license to mutate anything — it means the human left it alone.
5. **Report applied / skipped / error counts.** Always close the loop with a
   concrete breakdown so the human can see what landed and what did not.

## A safe apply loop (shape)

```text
for each decision in decisions:
    item  = decision.item            # raw snapshot from review time
    live  = fetch_current(item)      # re-verify state now
    if live is gone or changed materially:
        decision.result = "skipped-stale"; continue
    if is_destructive(decision.action):
        require explicit approval marker; else skip/ask
    apply(live, decision.action, note=decision.note)
    decision.result = "applied" or "error"
report applied, skipped, errors
```

## What counts as "explicit approval"

- The exported decision JSON is present and a human delivered it (not fabricated
  by the agent).
- The chosen `action` is a real, concrete action in the spec (or a clearly safe
  global one), not "defer"/"needs human decision".
- For destructive actions, the `action` id itself IS the approval — the human
  clicked it on that specific card.

## Deterministic vs. agent-driven apply

Two acceptable shapes:

- **Deterministic apply script** — a script that reads decision JSON, maps each
  `action` to a concrete operation, and applies it with the rules above. Good
  for high-volume, well-understood actions (e.g. link these pairs, set these
  statuses).
- **Agent-driven apply** — an agent (like Dip) walks the decision JSON and
  makes changes with normal tools, preserving the safety rules manually. Good
  for interpretive actions that need judgment (e.g. "merge this", "move to
  notes").

Both must honor: verify-before-mutate, skip-or-ask on stale, no unapproved
destructive actions, and a final applied/skipped/error report.

## Pitfalls

- **Don't trust a stale snapshot as live truth.** Always re-fetch before
  writing.
- **`defer`/`needs human decision`/`ignore` are non-actions.** They mean "don't
  apply" — treat them as explicit skips, never as permission to guess.
- **Node escalation.** If a decision can't be honored safely, surface it to the
  human with the reason rather than silently dropping or forcing it.
- **Idempotency where possible.** Where an action is safe to re-run (e.g. "link
  these two"), make the apply script idempotent so a retry doesn't duplicate.
