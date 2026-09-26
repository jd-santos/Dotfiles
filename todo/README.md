# Todo workbench

This directory uses the
[`todo-manager`](https://github.com/jd-santos/Skills/tree/main/skills/todo-manager)
workflow from [jd-santos/Skills](https://github.com/jd-santos/Skills). It keeps
unfinished dotfiles work readable without turning Markdown into a second issue
tracker.

The workflow separates three things that are easy to mix:

- the work that needs attention now,
- the plans and evidence needed to finish larger efforts,
- the history of work that has already shipped.

That separation keeps the live list useful while preserving context worth
returning to later.

## How it is organized

- [TODO](TODO.md) is the live priority list. Small tasks can stay there as
  checklists. Larger tasks link to their own folder under [`work/`](work/).
- [`work/`](work/) contains the record for substantial work. Each folder starts
  with a README covering the goal, status, checklist, and relevant supporting
  material.
- [DONE](DONE.md) points to completed work in Git, merged pull requests, the
  changelog, and retained work records. It is a map to history, not a second
  task list.

## Priorities

Tasks use five priority levels:

1. **P1: Rush** for work that needs immediate attention.
2. **P2: High** for important work that should happen next.
3. **P3: Essential** for required work without immediate urgency.
4. **P4: Low** for useful work that can wait.
5. **P5: Minor** for small improvements and optional polish.

Priority describes urgency, not progress. The task or its work README records
whether it is planned, active, blocked, ready for review, or ready to ship.

## Using the workbench

Add a short task directly to TODO. If the work needs a detailed checklist or
supporting files, create `work/<descriptive-name>/README.md` and link it from
the TODO entry. Keep one detailed checklist so progress does not drift between
files.

When work ships, remove it from the live list. Keep work records that explain
important decisions or preserve useful evidence. Git and pull requests remain
the source of truth for what changed, and the [changelog](../CHANGELOG.md)
records notable user-visible changes.

The [local todo-manager skill](../agents/.agents/skills/todo-manager/SKILL.md)
contains the full workflow. This workbench replaced the former root `TODO.md`,
which now redirects here.
