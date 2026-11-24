---
status: awaiting_human_review
---

# Responsive Pi shelf

Make session detail useful at narrow and short terminal sizes without replacing the working prompt and footer. Keep Lens tools available while hiding its below-editor widget by default.

## Decisions

- Keep the shelf as a compact, non-focus-stealing overview below the editor. Use two columns when each section has enough width, and fewer previews as height shrinks.
- Keep the first useful preview instead of replacing it with an overflow notice. Provide a command hint and a separate detail overlay so hidden content remains reachable.
- `/shelf details` opens an interactive detail view; `/shelf <section-id>` selects a section directly. Arrow keys scroll or switch sections, with keyboard access in regular mode and mouse access in fullscreen.
- Keep existing section registration, open-state persistence, prompt styling, and footer behavior.
- Deploy only the tracked Lens config link. Ignore Lens runtime artifacts in Stow as well as Git; do not move or delete existing runtime files.
- The coordinator is the sole writer in this checkout. Existing permission-prompt, shell startup, and skill changes are outside this scope.

## Checklist

- [x] Deploy the Lens config and restrict Stow to its tracked config
- [x] Implement the responsive overview and scrollable section detail
- [x] Add resize, navigation, lifecycle, and regression coverage using the installed Pi renderer
- [x] Sync `pi/README.md` and `pi/docs/reference.md`
- [x] Run focused tests, active diagnostics, and separate correctness and design reviews

## Validation

- 44 focused tests pass across shelf, shell, cache tracker, subagent shelf, strict shelf layout typechecking against the installed Pi TUI, and isolated GNU Stow deployment.
- Active LSP diagnostics ran on both changed source files. The repository's inferred TypeScript project cannot resolve the external Pi TUI import; the explicit installed-SDK typecheck passes. Remaining findings are style advisories, including existing shelf warnings.
- The Stow dry run no longer proposes Lens runtime-file links. The global config link is deployed; existing runtime files were not changed.
- Lens Stow protection is committed in `7953c27`. Separate correctness and design reviews completed. Both questioned the leading slash in the Stow rule; this finding is invalid: GNU Stow 2.4.1 prefixes `/` for path matching (`Stow.pm`, `ignore`). The isolated regression fixture confirms the tracked rule excludes runtime state and removing the slash admits it.
- Fixed the correctness review's command collision: drawer controls take precedence, and `/shelf details <section-id>` reaches sections named `open`, `close`, or `details`. The regression test covers all three names. No other implementation blockers were reported.
- The existing `shelf.ts` integration retains its pre-existing `@ts-nocheck`; the new layout module has strict installed-SDK type coverage. Live TUI and startup behavior still require the checks below.
- A repository-wide whitespace check reports an unrelated trailing blank line in `zsh/.zshrc`; do not change that session's file here.

## Human review

- [ ] Required before closeout: reload or restart Pi and inspect the shelf at narrow, wide, and short sizes. How: use `/shelf`, `/shelf details`, and `/shelf cache`; resize while detail is open, scroll to the end, switch sections, and press Esc. Look for readable figures, reachable hidden content, and an intact editor after closing. In fullscreen, also click a section and use the wheel.
- [ ] Required before closeout: restart Pi after deploying the Lens config. Look for no Lens widget below the editor while Lens tools remain available.
