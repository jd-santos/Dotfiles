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

- [ ] Verify Pi Sol/Luna context limits before changing compaction policy [context: small]
  - [x] Create `investigate/pi-context-window` and trace footer, advisory, and automatic compaction
  - [x] Confirm bundled and cached Codex metadata reports 272,000 tokens; OpenRouter reports 1,050,000 for `gpt-6-luna` and `gpt-6.1-sol`
  - Findings: `footer.ts` and `context-planner.ts` use Pi's `getContextUsage()`, which takes the limit from model metadata. Model context definitions remain unchanged.
  - [x] Raise `auto-compact.ts` from 70% to 80%, or 217,600 tokens with the Codex default; sync Pi docs and verify all 9 compaction/advisory tests, LSP diagnostics, and `git diff --check`
  - Decision: retain Pi's configured model budgets while using more of the existing short-context window.
  - Evidence: [Pi Codex Sol catalog](https://pi.dev/models/openai-codex/gpt-6-1-sol), [Pi OpenRouter Sol catalog](https://pi.dev/models/openrouter/openai-gpt-6-1-sol). Catalog values do not prove the backend's maximum supported capacity.
  - [ ] Verify supported capacity on the ChatGPT Codex route and whether 272k is a conservative default before applying a provider-specific override

- [ ] Evaluate an explicit long-context pricing opt-in UI for Pi [context: medium]
  - [ ] Research provider-specific long-context input, cache, and output pricing tiers, including whether subscription routes follow the same policies
  - [ ] Design separate indicators for configured context budget, pricing boundary, and supported model capacity; offer a deliberate session-scoped opt-in with cost warnings and a return to conservative defaults
  - OpenAI reference: prompts above 272k can incur 2× input/cache and 1.5× output pricing for the whole request. Do not treat this as a cache invalidation boundary or assume the API rates apply to Codex subscription usage.
  - No pricing-tier UI or model-window overrides are implemented by the 80% compaction change.
- [ ] Review the pinned `pi-subagents` upgrade for its `typebox` peer
  dependency fix [context: medium]
  - [x] Upgrade shared package pin to `0.76.1` and regenerate local settings
  - [ ] Restart or reload Pi, then smoke test a subagent launch; this session
        still had old child-runtime extension paths loaded
- [x] Recheck the Parallel web extension for an upstream `typebox` peer
  dependency fix [context: small]
  - Finding: `@parallel-web/pi-extension@1.3.0` still declares `typebox` in
    dependencies. `merge-settings` patches the installed manifest until an
    upstream release fixes it.
- [ ] Document and investigate Parallel research completion and result access in Pi [context: medium]
  - [ ] Check existing Parallel extension support for background completion; design persistent run tracking, bounded status checks, result retrieval, and agent wake-up without an agent polling loop
  - [ ] Investigate why API-created research links do not open results or appear in the user's Parallel history; verify API versus web-app workspace visibility without accessing secrets
  - [ ] Provide a durable local report fallback and document retrieval, failure handling, and Pi usage in `pi/README.md` and `pi/docs/reference.md`
  - Evidence: the context-limit research completed and was retrieved successfully through `getStatus` and `getResultMarkdown`, but the returned platform URL was not usable for the user. API retrieval and browser visibility must be verified separately.
- [ ] [Pi permission prompt notifications](work/pi-permission-notifications/README.md)
- [ ] Revisit `commit-message-writer` skill for progressive disclosure and tone
- [ ] Evaluate a structured context-planning tool if prompt guidance does not produce consistent work sizing
- [ ] Consider an optional generated handoff prompt or user-triggered compaction helper after the advisory workflow is proven
- [ ] Research educational UX practices that could improve `shareable-doc-writer` output
- [ ] Extend `/usage` with cached pricing, JSON export, per-project filtering, and trend deltas

## P5: Minor

- [ ] Consider a richer `/usage` table renderer if the widget output is too dense
