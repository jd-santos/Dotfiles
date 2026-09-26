# Pi permission prompt notifications

Status: In progress. Branch `feat/pi-permission-notifications`.

## Purpose

Notify the user when Pi blocks on a permission prompt, so a long-running or
backgrounded session does not wait silently. Deliver the notification through
OSC 777 in terminals that support it, with a contextual fallback when they do
not.

## Decisions

- Emit OSC 777 only in interactive Ghostty or cmux sessions outside tmux.
- Fall back to the cmux CLI inside a cmux surface, or macOS Notification Center
  through `osascript`. Other platforms have no fallback.
- Ignore notification failures. OSC 777 has no delivery acknowledgement, so a
  suppressed notification cannot be detected.
- Remove the cmux flash hook; the desktop notification is the primary signal.

## Work

- [x] Implement OSC 777 notification dispatch in `permission-gate.ts`.
- [x] Keep notification failures silent and remove the cmux flash action.
- [x] Add helper tests for notification context.
- [x] Sync `pi/README.md` and `pi/docs/reference.md`.
- [ ] Smoke test Python and heredoc bash permission prompts in a live Pi session.
- [ ] Run focused validation for the changed helper paths.
- [ ] Review and open a pull request.

## Supporting material

- Changed files: `pi/.pi/agent/extensions/permission-gate.ts`,
  `pi/.pi/agent/extensions/tests/permission-gate.test.ts`, `pi/README.md`, and
  `pi/docs/reference.md`.
- The work is committed on `feat/pi-permission-notifications`; smoke testing is
  the remaining gate before review.
