# Herdr JD bridge and agent titles

Status: In progress. Branch `feat/pi-herdr-jd-bridge`.

## Purpose

Give Pi one general place to publish small display-only values to Herdr, and use
it to show a conversation short title on the Herdr Agent sidebar row for each pi
agent.

Herdr identifies an agent by the pane that hosts it, so the transport is pane
metadata, but the value is tracked on the agent record and rendered per agent.

## Decisions

- `herdr-jd.ts` is the general bridge. It reports display-only pane metadata and
  can carry more small exports later.
- The bridge does not edit `herdr-agent-state.ts`, which Herdr manages and
  overwrites on integration updates.
- The short title is produced in the same summary model call as the existing
  8-15 word summary, so there is no extra model spend.
- The Agent sidebar shares the title on the agent row instead of spending a full
  extra row: `["agent", "$title"]`.
- Title text is `<dir> · <title>`, trimmed on a word boundary to 80 characters.
- Forked sessions append a compact `↳ <parent title>` suffix, read from the
  parent session recorded in the session header.
- The token carries a 6 hour TTL so a crashed session does not leave a stale
  title.
- `--source herdr:jd` keeps the title token separate from lifecycle reports.

## Work

- [x] Add `lib/herdr-title.ts` pure helpers with unit tests.
- [x] Extend the summary prompt to return a short title with the summary.
- [x] Add `herdr-jd.ts` to publish the `title` token.
- [x] Configure the Agent sidebar to show `$title`.
- [x] Sync Pi docs and the changelog.
- [ ] Validate the live token in a Herdr pane after a Pi restart.

## Validation

- `node --test pi/.pi/agent/extensions/tests/herdr-title.test.ts`: 8 pass, 0 fail.
- `herdr config check`: `config: ok`.
- A live `pane report-metadata` token was accepted earlier and surfaced on the agent as `tokens.summary`, confirming the transport.
- Pending: restart Pi in a Herdr pane, reload Herdr with `prefix+r`, and confirm the `$title` row shows the generated title.

## Supporting material

- Herdr pane metadata: `herdr pane report-metadata <PANE_ID> --source <ID>
  --token title=<text> --ttl-ms <ms>`.
- Custom sidebar tokens are documented in `herdr/.config/herdr/config.toml`.