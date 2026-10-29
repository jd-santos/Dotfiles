---
status: active
tags: [pi, extensions]
---

# Pi side questions

Add `/btw` as a separate, tool-free model request with a temporary overlay. The main agent continues running; side questions and answers never enter its model history.

## Decisions

- `/btw question` uses the current effective context. `/btw --last [N] question` selects recent user exchanges, with bare `--last` selecting one. Accept `-1` as an alias for one exchange.
- An exchange starts with an actual user request and includes finalized assistant and tool messages. Do not count injected instructions as user requests. Omit incomplete tool-call pairs, and label snapshots taken while the main run is active.
- No compaction option or summarization call. Never silently expand limited context.
- Preserve system/tool declarations and compatible provider options where possible. Cache reuse is best effort, never a prerequisite or a promised saving.
- Always obtain approval before the side request is dispatched. Show scope, model, conservative uncached catalog-cost estimate or explicit unknown subscription impact. Limit output, disable retries, and show returned usage, including cache reads. Financial budgets use estimates, not enforceable provider billing caps.
- Use an independent cancellation controller and SSE transport so side requests cannot occupy the main agent's cached WebSocket connection. Never execute tools or change the main agent's settings.
- Metadata-only `btw-request` and `btw-usage` entries are allowed in Pi's session journal to preserve budgets across reload/resume. This can advance the session leaf, but never changes model messages or stores side-question/answer text. The isolation contract concerns the main model history, not an immutable journal.
- OAuth is subscription-backed only when Pi's provider metadata explicitly marks it as such; OpenRouter OAuth stays subject to API budgets. Codex's subscription endpoint remains an explicit exception with unknown quota impact.
- Approval disclosures precede a bounded question preview. Enter stays disabled until the disclosure end has been displayed.
- Parent is the only writer. Fresh correctness and design reviewers have read-only scopes.

## Checklist

- [x] Implement argument parsing, context snapshots, provider request handling, approval, overlay, cancellation, and usage reporting.
- [x] Add offline regression tests, including main-session isolation and budget handling.
- [x] Update [Pi README](../../../pi/README.md) and [reference](../../../pi/docs/reference.md).
- [x] Run focused tests, active diagnostics, and two independent reviews; resolve findings.
- [ ] Validate live cache reuse and overlay behavior with user-approved paid requests. Do not claim this happened from mocked tests.

## Validation

No paid model calls are authorized for implementation tests. Live cache hit rates and subscription quota accounting remain unverified until a user-approved smoke test.

- `node --test pi/.pi/agent/extensions/tests/btw*.test.mjs pi/.pi/agent/extensions/tests/auto-compact.test.mjs pi/.pi/agent/extensions/tests/context-planner.test.mjs`: 32 passed, including 23 BTW checks and installed-SDK strict typechecking. Serialization callbacks abort before inference, with an injected fetch that also rejects network dispatch.
- `git diff --check`: passed.
- Active LSP probes ran on all changed source modules. Lens's inferred project cannot resolve host-provided Node/Pi modules in this dependency-free checkout; these are environment diagnostics, not evidence of SDK incompatibility. The focused strict TypeScript test resolves the actual installed declarations and passes. No fake declarations, dependencies, or machine-specific project paths were added to silence Lens.
- Initial correctness review identified OAuth/subscription misclassification and late receipts after tree navigation. Both are fixed with regression tests. Its journal-mutation finding is not a blocker under the clarified model-history contract above.
- Initial design review identified approval text hidden by long questions. Cost disclosures now come first, the preview is bounded, and approval is gated on displaying the disclosure end. A short-terminal regression test covers this.
- The single follow-up round returned OK with notes from correctness and design reviewers. Correctness's remaining incomplete-usage note was fixed by requiring recognized input/output counter pairs, with regressions for missing and invalid counters. No third round was launched.
- Final check: all 32 tests pass, including installed-SDK strict typechecking; the active six-file LSP error probe reports no errors; `git diff --check` passes. Inferred-project module-resolution warnings remain as described above.
- The stowed extension directory already exposes `btw.ts`; `/reload` is sufficient to load it. No installation, live inference test, or remote delivery was performed.

## Remaining validation

The implementation and offline review are complete. The only unchecked scope is a user-approved live smoke test: reload Pi, inspect `/btw --last` during a main run, cancel once before dispatch, and approve a request only after accepting its displayed cost or unknown subscription impact. Verify that the main run continues and compare returned cache usage against the provider's billing or quota UI. Do not describe cache reuse or quota impact as verified until that evidence exists.
