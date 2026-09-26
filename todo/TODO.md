# TODO

## P1: Rush

## P2: High

- [ ] Fix Pi permission-gate allow-always handling for complex bash commands
  - [x] Escape regex-based command pattern rules
  - [x] Avoid pattern-scope options for heredocs and other complex bash commands
  - [x] Make deny rules block immediately instead of falling through to another prompt
  - [x] Smoke test longer complex bash command handling in helper logic
  - [ ] Smoke test Python and heredoc bash prompts in Pi
  - [x] Polish permission-gate prompt layout and add full-command toggle
  - [x] Add combined write + edit allow scope for write/edit prompts
  - [x] Analyze recent Pi bash tool calls without loading conversation content
  - [x] Expand static inspection policies for commands with predictable read-only behavior
  - [x] Keep interpreters, execution wrappers, package managers, network tools, and complex shell syntax behind prompts
  - [x] Require every command in a chain to be covered by static safety or session allow rules
  - [x] Add separate read-only Git and all Git session scopes
  - [x] Add helper-level regression tests for command analysis and rule coverage
  - [x] Sync Pi README and reference documentation
  - [x] Default CWD write and edit operations to allow, while retaining delete-like and permission-changing safeguards
  - [x] Broaden bash permissions with a hybrid risk policy and preserve hard blocks for sensitive access
  - [x] Reorder permission scopes: exact session pattern, yolo, global write/edit, tool-specific choices, then directories
  - [x] Update Pi permission documentation and run focused regression checks

## P3: Essential

- [ ] Add Pi analytics and git helper extensions
  - [x] Implement `lg.ts` as a scripted git summary command with `--staged` and `--all` modes
  - [x] Implement `tps-tracker.ts` with live footer status and final notification
  - [x] Implement `usage.ts` as a local Pi and Codex usage parser with a Markdown widget report
  - [x] Update Pi docs with the new commands and behavior
  - [ ] Smoke test in Pi with `/reload`, `/lg`, `/lg --staged`, `/lg --all`, and `/usage`
- [ ] [Herdr JD bridge and agent titles](work/herdr-jd-bridge/README.md)

## P4: Low

- [ ] [Pi permission prompt notifications](work/pi-permission-notifications/README.md)
- [ ] Revisit `commit-message-writer` skill for progressive disclosure and tone
- [ ] Evaluate a structured context-planning tool if prompt guidance does not produce consistent work sizing
- [ ] Consider an optional generated handoff prompt or user-triggered compaction helper after the advisory workflow is proven
- [ ] Research educational UX practices that could improve `shareable-doc-writer` output
- [ ] Extend `/usage` with cached pricing, JSON export, per-project filtering, and trend deltas

## P5: Minor

- [ ] Consider a richer `/usage` table renderer if the widget output is too dense
