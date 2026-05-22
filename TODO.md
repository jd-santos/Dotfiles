# TODO

## In Progress

- [ ] Add Pi analytics and git helper extensions
  - [x] Implement `lg.ts` as a scripted git summary command with `--staged` and `--all` modes
  - [x] Implement `tps-tracker.ts` with live footer status and final notification
  - [x] Implement `usage.ts` as a local Pi and Codex usage parser with a Markdown widget report
  - [x] Update Pi docs with the new commands and behavior
  - [ ] Smoke test in Pi with `/reload`, `/lg`, `/lg --staged`, `/lg --all`, and `/usage`

## Up Next

## Backlog

- [ ] Extend `/usage` with cached pricing, JSON export, per-project filtering, and trend deltas
- [ ] Consider a richer `/usage` table renderer if the widget output is too dense

## Done

- [x] Move Pi model status into the input editor banner and trim the footer to three lines
- [x] Centralize Pi footer layout and status design (custom footer, MCP live/cache labels, docs)
- [x] Add louder Pi permission prompts with cmux alerts and a pointer widget
- [x] Expand Pi permission-gate auto-allow patterns for exploratory shell commands
- [x] Add interactive tracked-skills add flow with multi-skill repo support
- [x] Add tracked skills review-and-update script with manifest-driven sync
- [x] Add tracked skills workflow for `agents/` (tracking layout, sync script, docs, `informed-patient` import)
- [x] Tune Pi message contrast and model selection behavior (stronger user message card, editor banner, scoped model list, restore notice)
- [x] Add Pi UI extension for read display and slash-command shortcut hints (read background, 5-line preview, configured keybinding hints)
- [x] Permission Gate Extension - Complete
- Original 7 commits on `pi` branch.

## Commits

1. ~~**feat(pi): add yolo mode and session rules**~~
   - Add `/yolo`, `/rules`, `/reset-rules` commands
   - Two-step TUI prompt with once/always/deny flow
   - Session rule engine with allow/deny lists
   - Status bar feedback

2. ~~**refactor(pi): two-step permission UX with better labels**~~
   - Cohesive option labels with icons
   - Consistent indicator emojis
   - Cleaner prompt helper signatures

3. ~~**feat(pi): add parent/grandparent directory options**~~
   - `getDirChain()` helper for up to 3 directory levels
   - Directory scope options: 📁, 📂, 📂📂

4. ~~**feat(pi): multi-command bash detection**~~
   - `splitCommandParts()` and `extractCommandPatterns()` helpers
   - Per-pattern allow/deny scope selectors
   - All parts checked for safe-list and deny-list

5. ~~**fix(pi): security and maintability improvements**~~
   - Deny patterns check raw command AND split parts
   - `never` exhaustiveness on `matchRule()` and `formatRule()`
   - Clear session rules when toggling yolo
   - SECURITY NOTE header documenting limitations
   - `/reset-rules` documents ephemeral behavior

6. ~~**feat(pi): deduplicate session permission rules**~~
   - `pushRule()` helper with `formatRule()` key dedup
   - Prevents duplicate entries for same directory/tool/pattern

7. ~~**docs(todo): track permission gate improvements**~~
