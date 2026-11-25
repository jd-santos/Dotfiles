---
status: complete
---

# Pi permission risk boundaries

Reduce interruptions after session YOLO approval without granting blanket system
write access. Keep the existing permission-prompt work and its live smoke test
open in the task index.

## Behavior

- Recognized inspection commands may reference protected system paths without a
  high-risk prompt. A `cd` into a protected directory only qualifies when its
  entire chain is inspection-only.
- Successful standalone `mktemp -d` or `/usr/bin/mktemp -d` calls register their
  output directory as session-owned scratch space. Only YOLO exempts ordinary
  operations there from protected-path prompts. Registration requires a real,
  user-owned directory below an OS temporary root, not the root itself.
- Scratch scope resolves existing symlinks and rejects escapes, dangling links,
  and replacement of the registered root with a symlink. It does not authorize
  deletion, permission changes, remote execution, or sensitive-directory access.
- Hard resets, non-dry-run Git clean, force pushes (including lease and `+`
  refspec forms), and remote deletion/mirror pushes require one-time approval.
  Session allow rules and YOLO cannot bypass these checks.
- Common execution prefixes, including `nice`, `timeout`, and `xargs`, do not
  hide destructive Git. Option values and flag ordering cannot make a mutating
  Git clean look like a dry run.
- Read-only mode blocks mutating Bash commands before an approval can be offered.
  Static `sed` inspection is print-only, with optional numeric addresses.
- Explicit paths to Unix password-hash stores and macOS local authentication
  records are blocked before inspection exemptions, after literal argument
  normalization and metadata-only alias resolution. Tests use strings and
  mocked tool calls, never the contents of those stores.
- Rules and scratch registrations remain local to the extension instance. No
  session logs, machine-specific paths, or private examples belong in Git.

## Validation and delivery

- [x] Implement protected-path inspection and bounded scratch exemptions.
- [x] Add destructive Git checks and preserve hard blocks.
- [x] Cover helper behavior and tool-hook flows with regression tests.
- [x] Sync Pi README, reference, agent instructions, and changelog.
- [x] Run focused tests, active diagnostics, and correctness/design reviews.

Delivery is a topic-branch commit and PR, separate from implementation status.
Unrelated main-checkout edits are not part of this slice.

### Evidence

- All 41 focused permission tests pass, including SDK typechecking.
- Active LSP checks report missing workspace SDK/Node dependency resolution and
  inferred-project warnings. The installed-SDK typecheck passes; no dependency
  installation or repository-wide configuration change was needed.
- Initial correctness review found a `nice` wrapper gap. Initial design review
  found mutating `sed` misclassification and missing explicit authentication-store
  denies. All were accepted, fixed, and covered by regressions.
- Parent checks also covered option-value/dry-run cancellation cases and symlink
  traversal through `..`.
- One follow-up review round confirmed the initial fixes and identified separate
  `env -a`/`--argv0` values and authentication-path normalization gaps. Both were
  accepted and fixed with helper/tool-hook regressions, including dot components,
  relative paths, and simple `cd` chains. Final parent validation passes all 41
  tests and `git diff --check`; no additional review round was launched.
- Live `/reload` and terminal hotkey smoke tests remain in the existing task;
  this slice's approval behavior is validated through the tool-hook harness.

This remains a consent layer, not a sandbox or a full shell/Git parser. Shell
wrappers, aliases, embedded scripts, and commands that generate other commands
are not exhaustively analyzed. Temporary directories are retained; registration
does not add automatic cleanup.
