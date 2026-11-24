# Herdr JD bridge and agent titles

Status: App title-label follow-up implemented and reviewed; live Pi reload and visual verification remain. The legacy TUI bridge shipped in [PR #35](https://github.com/jd-santos/Dotfiles/pull/35) and the sidebar layout follow-up in [PR #36](https://github.com/jd-santos/Dotfiles/pull/36).

## Purpose

Give Pi one general place to publish small display-only values to Herdr, and use
it to show a conversation short title on the Herdr Agent sidebar row for each pi
agent.

Herdr identifies an agent by the pane that hosts it, so the transport is pane
metadata, but the value is tracked on the agent record and rendered per agent.

## Legacy TUI decisions

- `herdr-jd.ts` is the general bridge. It reports display-only pane metadata and
  can carry more small exports later.
- The bridge does not edit `herdr-agent-state.ts`, which Herdr manages and
  overwrites on integration updates.
- The short title is produced in the same summary model call as the existing
  8-15 word summary, so there is no extra model spend.
- The Agent sidebar shows the title in the second row without spending a third
  row: `["$title"]`.
- Follow-up after PR #35: keep the existing location row and publish `π` as a
  separate token after it. Show the unprefixed title on the second row. Herdr
  inserts `·` between location and glyph. It may truncate the title at the
  sidebar edge; do not fake wrapping. Keep the 80-character cap.
- Forked sessions append a compact `↳ <parent title>` suffix, read from the
  parent session recorded in the session header.
- The token carries a 6 hour TTL so a crashed session does not leave a stale
  title.
- `--source herdr:jd` keeps the title token separate from lifecycle reports.

## Herdr App follow-up

Focused change [context: medium]. Keep the legacy TUI transport intact. In a
Core terminal, publish the generated short title through a namespaced terminal
label, with a six-hour expiry. Card File reads that value instead of Pi's generic
terminal title. Keep the larger logo, location and turn information.

- [x] Publish stored, generated and manual titles to the calling Core terminal
- [x] Clear on `/summary clear`, session replacement and shutdown; serialize writes
- [x] Use the summary title across Card File's sidebar, board and compact rows
- [x] Test transport, ordering, clearing, expiry and non-Pi fallbacks
- [x] Sync Pi and Card File documentation and run correctness/design reviews
- [ ] Reload Pi and visually verify a generated title in Herdr App

## Work

- [x] Add `lib/herdr-title.ts` pure helpers with unit tests.
- [x] Extend the summary prompt to return a short title with the summary.
- [x] Add `herdr-jd.ts` to publish the `title` token.
- [x] Configure the Agent sidebar to show `$title`.
- [x] Sync Pi docs and the changelog.
- [x] Confirm Herdr receives the title token in a running Pi pane.
- [x] Remove the redundant directory prefix and `agent` label from the title row.
- [x] Move `π` to the first row as a separate token and leave the second row for the title.
- [x] Update tests and docs, and verify the config.
- [ ] Restart Pi and reload Herdr to check the live two-row layout.

## App validation

- 24 focused tests passed: `node --test pi/.pi/agent/extensions/tests/herdr-title.test.ts pi/.pi/agent/extensions/tests/herdr-bridge.test.ts bin/tests/cardfile-agent-title.test.mjs`.
- `herdr-app check herdr-app/.config/herdr-app/mods/cardfile` passed; scoped `git diff --check` passed.
- Active LSP probes reported no findings in the changed Pi bridge, summary, helper and test paths, with three paths inconclusive. Card File has existing strict-JavaScript diagnostics; a compiler comparison against HEAD found 446 baseline and 446 current diagnostics, with no new diagnostic identities.
- Fresh correctness review found no issues. Design review identified the stale status sentence above, now corrected.
- Existing Stow paths resolve to the edited Pi source. Run `/reload` in each running Pi session to restore its stored short title. No new summary-model call is required. Live rendering has not been verified.

## Legacy TUI validation

- `node --test pi/.pi/agent/extensions/tests/herdr-title.test.ts`: 9 pass, 0 fail after moving the glyph.
- `herdr config check`: `config: ok`.
- A live `pane report-metadata` token was accepted earlier and surfaced on the agent as `tokens.summary`, confirming the transport.
- Pending: restart Pi in a Herdr pane, reload Herdr with `prefix+r`, and confirm the first row shows `Dotfiles · π` (or the current location) and the second row shows only the title.
- Sidebar width is managed as a separate Herdr setting.

## Supporting material

- Herdr pane metadata: `herdr pane report-metadata <PANE_ID> --source <ID>
  --token title=<text> --ttl-ms <ms>`.
- Custom sidebar tokens are documented in `herdr/.config/herdr/config.toml`.