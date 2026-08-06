# TODO

## In Progress

- [ ] Add context-aware planning advisories to Pi
  - [ ] Snapshot `ctx.getContextUsage()` after each user prompt so capacity informs tool selection for the full agent run
  - [ ] Inject the snapshot as transient context without adding stale usage messages to the saved session
  - [ ] Add stable agent guidance for context-aware work sizing and stopping points
  - [ ] Below 50%, work normally while keeping future work divisible into focused changes, subsystem clusters, research tasks, or future subagent packets
  - [ ] At 50%, recommend finishing the current coherent unit and documenting the remaining work
  - [ ] Between 50% and 80%, increasingly favor bounded work, handoff preparation, and smaller future-agent packets
  - [ ] At 80%, do not start new work except small fixes needed to leave the project coherent
  - [ ] Add a small, medium, or large estimated context size to planned future-agent and subagent packets
  - [ ] Use `TODO.md` as the durable handoff ledger and record when handoff preparation occurs
  - [ ] Keep the first version advisory-only, with no automatic compaction, TODO edits, session switching, or subagent execution
  - [ ] Handle unknown usage immediately after compaction and context-window changes after model selection
  - [ ] Smoke test prompt-time injection, planning recommendations, the 50% wrap-up behavior, and the 80% hard stop
  - [ ] Update `pi/README.md` and `pi/docs/reference.md` with the user-visible behavior
- [ ] [HIGH] Fix Pi permission-gate allow-always handling for complex bash commands
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
- [ ] Add Pi analytics and git helper extensions
  - [x] Implement `lg.ts` as a scripted git summary command with `--staged` and `--all` modes
  - [x] Implement `tps-tracker.ts` with live footer status and final notification
  - [x] Implement `usage.ts` as a local Pi and Codex usage parser with a Markdown widget report
  - [x] Update Pi docs with the new commands and behavior
  - [ ] Smoke test in Pi with `/reload`, `/lg`, `/lg --staged`, `/lg --all`, and `/usage`

## Up Next

- [ ] Revisit `commit-message-writer` skill for progressive disclosure and tone

## Backlog

- [ ] Evaluate a structured context-planning tool if prompt guidance does not produce consistent work sizing
- [ ] Consider an optional generated handoff prompt or user-triggered compaction helper after the advisory workflow is proven
- [ ] Extend `/usage` with cached pricing, JSON export, per-project filtering, and trend deltas
- [ ] Consider a richer `/usage` table renderer if the widget output is too dense

## Done

- [x] Extract Offgrid Review into `jd-santos/offgrid-review` and track the standalone skill
- [x] Refresh Pi GPT-5.6 defaults and OpenRouter shortlist
- [x] Convert Pi `/ship` prompt into reusable `ship` skill
- [x] Update Pi model defaults and scoped model list
- [x] Rewrite Pi README into a readable overview with minimal reference docs
- [x] Add changelog-writer skill (Keep a Changelog sections with optional SemVer)
- [x] Persist Pi conversation summaries as session names without extra LLM calls
- [x] Add global Pi `/ship` prompt for branch review, commit grouping, and push workflow
- [x] Switch Pi conversation summarizer to `openai-codex/gpt-5.4-mini` with Anthropic fallback when config is missing
- [x] Trim Pi footer status line and expand permission-gate safe commands (hide MCP-only line, allow comment-only bash)
- [x] Tweak Pi footer and permission gate UI (remove footer divider, simplify MCP availability, drop pre-prompt warning)
- [x] Rewrite Pi conversation summary extension to prevent recursive spend (direct Haiku call, UI-only trigger, no thinking, cooldown and cap guardrails)
- [x] Consolidate marimo skills to two entries (hub references plus active-kernel pair skill)
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
