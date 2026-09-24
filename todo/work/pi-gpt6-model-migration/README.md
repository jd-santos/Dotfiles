# Pi GPT-6 Sol and Luna migration

Status: Ready for merge

## Purpose

Move Pi's active Sol and Luna routes from GPT-5.6 to GPT-6 after the GPT-6 Sol and Luna launch, while keeping GPT-5.6 Terra selectable for compatibility.
Put Codex routes first in the `Ctrl+P` cycle and OpenRouter routes at the bottom.

## Decisions

- Default remains Codex, changing from `gpt-5.6-sol` to `gpt-6-sol` at medium thinking.
- Scout, Researcher, Reviewer, and Worker use Codex GPT-6 Luna at xhigh thinking.
- Oracle uses Codex GPT-6 Sol at high thinking, and Delegate uses it at medium thinking.
- Worker and Reviewer no longer use GPT-5.6 Terra because the requested role routing overrides the previous assignment.
- OpenRouter entries remain available but move after all Codex entries in the scoped cycle.
- The generated local model catalog remains provider metadata. Refresh it instead of manually rewriting historical GPT-5.6 records.
- GPT-5.6 Pro standby routes remain documented by explicit user choice; they are not active Sol/Luna assignments.

## Checklist

- [x] Update shared Pi settings and strict subagent model scope.
- [x] Regenerate local `~/.pi/agent/settings.json` from shared settings.
- [x] Refresh the local model catalog and verify GPT-6 Sol and Luna routes.
- [x] Sync `pi/README.md` and `pi/docs/reference.md`.
- [x] Run JSON, reference, and targeted model-reference validation.
- [x] Review the final diff and record remaining risks.

## Validation

- `bin/bin/merge-settings` regenerated `~/.pi/agent/settings.json`.
- `pi update --models` refreshed the local catalog.
- JSON parsing, source/generated settings parity, exact role assertions, active-reference scanning, catalog lookup, and `git diff --check` passed.
- Two correctness and design review rounds passed. The final reviewers made no required changes.
- The local catalog still lists historical GPT-5.6 records and explicit GPT-5.6 Pro standby routes. Active non-Pro settings use GPT-6 Sol/Luna.

## Acceptance

- No active model assignment or non-Pro maintained Pi documentation points to
  GPT-5.6 Sol or GPT-5.6 Luna.
- The scoped cycle lists Codex entries first and OpenRouter entries last.
- The requested role models and thinking levels are reflected in shared and generated settings.
- GPT-5.6 Terra remains selectable and is the only GPT-5.6 Codex route allowed by strict child scope.
- The local catalog exposes GPT-6 Sol and GPT-6 Luna without credentials or
  private values entering the repository.
