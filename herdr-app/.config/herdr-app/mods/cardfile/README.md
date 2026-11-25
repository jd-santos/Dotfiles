# Card File

Herdr App's sidebar and side panel, redone as index cards. The sidebar stacks
spaces over agent cards. The side panel, right of the terminals, holds
**Files**, **Changes** and **Todo** as tabs. Todo shows cards from card
sources (plugins). **Board** shows your agents in lanes, in place of the
terminals.

The `cardfile` layout uses it, with the `cardfile` theme. Switch with
`ctrl-shift-l` or `herdr-app do layout.switch '{"name":"cardfile"}'`. Open the
panel from **Files**, **Changes** or **Todo** in the tab bar. The Todo and Board
buttons are a separate `cardfile` block after Herdr's tab bar, so the shipped
tab bar stays unmodified and keeps getting updates.

## Agent cards

Each card shows:

1. A 20px agent logo beside its title (Claude Code names its session), up to
   three lines, and a mark for where it stands with you (below). A title that
   only repeats the agent's name is hidden when its logo is available.
2. What it reports it is doing now, up to two lines.
3. Its space and tab, helpers it started, and its turn.

Pi cards use the generated conversation short title, not Pi's terminal title
(`Pi - …`). The `herdr-jd.ts` Pi extension publishes it to the Core terminal's
`pi.title` label as JSON with `title` and `expiresAt`. Manual `/summary <text>`
overrides it; `/summary clear` removes it. Missing, invalid or expired labels
show **Awaiting summary**. Other agents keep their own session titles. The same
selection applies to the board and compact agent rows.

After updating the Pi bridge, run `/reload` in each running Pi session to
publish its stored title. No new summary-model call is needed. The label expires
six hours after publication and is removed on graceful shutdown; a new run
renews it. Lifecycle status reports are unchanged.

The sidebar sorts cards in the board's lane order: **Needs you**, **Review**
with the longest-waiting on top, **Parked**, running agents, then **Done**.
Parked and Done cards are dimmed and drop the message and turn, because
you've already made your call.

| Mark | Means |
| --- | --- |
| "Needs you" chip | The agent is stuck until you answer. |
| Filled diamond | Review: it finished a turn you haven't looked at. |
| Outlined diamond | Review: it finished and you've looked, but haven't decided. |
| Spinner | It's working. |
| Bookmark | Parked: you're putting it off, on purpose. |
| Check | Done: you've accepted the work. |

Click the mark, or right-click the card, to change your call: a small menu
offers your lanes (**Parked**, **Done**) and **Reopen** to take the call back.
These marks are your calls, not the agent's own status. Herdr's "done" status
means the agent finished while you weren't looking, and shows here as the
filled diamond.

Click a card to focus that agent. **This space** shows the shown space's agents.
Agents elsewhere that need you, or finished a turn you haven't seen, still get
a line under **Other spaces**. **All** shows every agent. `agent.next` and
`agent.prev` follow the order on screen.

## Board

**Board** in the tab bar swaps the terminals for your agents in lanes. Click a
card to go to that agent. Picking another tab or pane in this space also goes
back to the terminals, and so does **×**. Switching spaces keeps the board, so
you can look through each space's board. It follows the sidebar's **This
space** / **All** switch.

The lanes hold your call on each agent, not the agent's status, which changes
every few seconds:

- **Needs you** and **Review** fill themselves: an agent that's blocked, or
  that finished and that you haven't decided on.
- **Parked** and **Done** are yours. **Park** and **Done** on a card put it
  there, and **Reopen** takes your call back. The card's mark opens the same
  menu as in the sidebar.
- **Running** is a narrow strip between Parked and Done, for agents at work.

Your call holds while the agent keeps working, until it starts another turn:
giving it more work means it isn't done anymore. Only "blocked" beats your
call, because the agent can't go on without you. A `sticky` lane keeps its
agents even after a new turn.

The lanes are `board` in `cardfile.json`, in board order. A `board` in
`cardfile.local.json` replaces the whole list.

```json
"board": [
  { "id": "needs-you", "label": "Needs you", "auto": "blocked", "tone": "blocked" },
  { "id": "review", "label": "Review", "auto": "finished", "icon": "review", "tone": "accent" },
  { "id": "parked", "label": "Parked", "action": "Park", "icon": "parked", "tone": "dim" },
  { "id": "running", "label": "Running", "auto": ["working", "new"], "tone": "working", "strip": true },
  { "id": "done", "label": "Done", "action": "Done", "icon": "done", "tone": "done" }
]
```

| Lane field | Meaning |
| --- | --- |
| `id` | Required. What the label stores. |
| `label` | The lane's name. |
| `auto` | Herdr statuses this lane collects, one or a list: `working`, `blocked` (needs you), `new` (idle, never given a turn), `finished` (done or idle, with no call of yours). A lane without `auto` is yours: agents get there only from a button or a label. |
| `action` | The button that puts an agent in a lane of yours, such as "Park". Defaults to the label. |
| `icon` | An SVG in this folder, without `.svg`, that marks the lane's cards and header. On a `finished` lane, `<icon>-unseen.svg` marks a turn you haven't seen. |
| `strip` | Draw the lane as a narrow column of one-line rows. |
| `sticky` | Keep agents moved here after they start another turn. |
| `tone` | The mark's color: `blocked`, `working`, `done`, `idle`, `accent`, `muted` or `dim`. |

A call is two labels on the agent's terminal, so it survives restarts, works
for agents on other machines, and can be set from anywhere:

```sh
hc label t3 cardfile.lane=done cardfile.turn=6   # until turn 7 starts
hc label t3 cardfile.lane=parked                 # no turn: until changed
hc label t3 cardfile.lane= cardfile.turn=        # take the call back
```

An agent can move itself this way, for example from a hook when it stops.

### For agents

Herdr's `done` status means you finished a turn. The board's **Done** lane
means the work is accepted and needs nothing more from the person. Those are
different things:

- A sub-agent, or a sibling agent working for another agent, can put itself
  in Done when its job is finished and its result has been handed back.
- An agent the person is working with directly leaves its lane alone, unless
  the person asks it to clean up on their behalf.
- Use Parked only when the person asks; it records their choice to wait.

```sh
t=$HC_TERMINAL_ID   # set in every Herdr terminal
hc label "$t" cardfile.lane=done cardfile.turn="$(hc get "$t" | jq .turn)"
```

With the turn recorded, Done lapses if someone gives you more work.

### Board sources

A board source fills the board from a program instead of your agents, such as an
issue tracker. List it under `boards`, usually in `cardfile.local.json`. The
board's header then switches between **Agents** and each source.

```json
{ "boards": [{ "id": "issues", "label": "Issues", "run": ["~/.local/bin/my-board"], "every": 120, "timeout": 60 }] }
```

`every`, `timeout` and `max` (default 500) work as they do for card sources. It
runs in your home folder; `"where": "space"` runs it in the shown space's folder.
The program answers three calls:

| Call | Prints |
| --- | --- |
| `my-board` | `{ "lanes": [...], "cards": [...], "views"?, "view"?, "title"?, "empty"? }` |
| `my-board moves <card id>` | `{ "lanes": ["lane-id", ...] }`: where the card can go now |
| `my-board move <card id> <lane id>` | Anything; exit non-zero with a reason on the last line to refuse |

A lane is `{ "id", "label", "tone", "note" }`, where `note` is a short line under
its name. A card takes the card source fields plus `lane`, its lane's id, and
`meta`, a short footer line. Cards show `tag` in the footer. With `views`, such
as `[{ "id": "mine", "label": "Mine" }, { "id": "team", "label": "Team" }]`, the
header gets a switch, and the program gets the chosen view as `CARDFILE_VIEW`.

**Move** asks `moves` first and offers only those lanes, so the program can
apply its own workflow rules. After a move the board refreshes.

With `"show": true` in the board's output, clicking a card opens it in a drawer
on the board's right, and the program gets a fourth call:

| Call | Prints |
| --- | --- |
| `my-board show <card id>` | The card fields plus `fields` (`[{ "label", "value" }]`), `markdown` (the body) and `lanes` (`[{ "id", "label" }]`, to name the moves) |

The drawer shows the fields, the lanes the card can move to, **Start an agent
on this** when the card has a `task`, and the markdown. Its buttons refresh it,
open the card's `url`, open the card as a tab of its own, and close it. The open
card is remembered, so the drawer stays open across reloads.

With `"comment": true` in what `show` prints, the drawer and tab get a comment
box under the card. Enter starts a new line; Cmd+Enter or **Post** sends it as
`my-board comment <card id> <text>`, and the card reloads. A failed post keeps
your text and shows the program's reason.

With `"edit": true`, a pencil beside the title turns it into a text box. Enter
or **Save** sends `my-board title <card id> <text>`, then the card and the board
reload; Esc or **Cancel** keeps the old title.

If `show` also prints `description` (the editable markdown), a pencil beside
**Description** edits it in a larger box. Enter starts a new line; Cmd+Enter or
**Save** sends `my-board describe <card id> <text> <was>`, where `<was>` is the
description the edit started from, so the program can refuse when someone else
changed it in the meantime. A `descriptionNote` shows above the box, for
example to warn that saving loses formatting the program can't write back.

## Card sources

A source is any program that prints cards as JSON. It can be a shell script,
Python, or anything that calls an API.

### Where sources are listed

- `~/.config/herdr-app/cardfile.json` is shared and stowed from this repo.
- `~/.config/herdr-app/cardfile.local.json` is for this machine only and is not
  in the repo. Put sources that name work systems here.

A local source with the same `id` changes that source's fields, and
`"enabled": false` turns it off. `agent` is the command **Start agent** runs.
The config is reread every 30 seconds. The board's lanes are in the same file
(see above).

```json
{
  "agent": ["claude"],
  "sources": [
    { "id": "todo", "label": "Todo", "run": ["~/bin/cardfile-todo"], "where": "space", "every": 60 }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `id` | Required. Unique name for the source. |
| `run` | Required. The program and its arguments. A leading `~/` is your home. |
| `label` | Section name, unless the program prints a `title`. |
| `where` | `"space"` (default): run in the folder you are working in, in the shown space, and again when that changes. `"home"`: run in your home folder. |
| `every` | Seconds between refreshes (default 120, at least 15). `↻` refreshes now. |
| `timeout` | Seconds before giving up (default 20, at most 120). |
| `max` | Most cards to show (default 50). |

### What the program gets

It runs in that folder with `CARDFILE_SOURCE`, `CARDFILE_SPACE` (the space's
name) and `CARDFILE_FOLDER` set. It runs on this computer, even for a space on
another machine.

### What the program prints

```json
{
  "title": "Todo · Dotfiles",
  "empty": "Nothing open.",
  "cards": [
    {
      "id": "PROJ-123",
      "title": "Fix the login redirect",
      "lines": ["Next: reproduce on staging", "context: medium"],
      "tag": "P2",
      "tone": "accent",
      "progress": [3, 8],
      "url": "https://example.atlassian.net/browse/PROJ-123",
      "file": "/abs/path/to/work/README.md",
      "task": "Fix the login redirect described in PROJ-123"
    }
  ]
}
```

Only `cards`, and `title` in each card, are required.

| Card field | Meaning |
| --- | --- |
| `id` | Stable id, so the card keeps its place between refreshes. |
| `title` | Wraps in Todo cards and the details header. |
| `lines` | Up to three lines. The first may wrap to two. |
| `tag` | A short chip before the title: a priority, a ticket key. |
| `tone` | Colors the tag and the line under the title: `blocked`, `working`, `done`, `idle`, `accent` or `muted`. |
| `progress` | `[done, total]`, drawn as a small bar. |
| `markdown` | Optional full item body. Clicking the card or **Details** opens it in a scrollable, read-only dialog. |
| `index` | Optional source TODO path; adds **Open TODO file** to details. |
| `links` | Optional `[{ "label", "file" }]` work-record links, shown as **Open work item** actions in details. |
| `file` | Opens as Markdown when no inline body is provided; **Work item** opens it directly from the card. |
| `url` | Clicking opens this link only when there is no `markdown` or `file`. Otherwise **Link** opens it from the card or details. |
| `task` | Adds **Start agent**, which opens a tab in the shown space running `agent` with this as its first message. |

`cardfile-todo` includes the whole inline item, with nested checkboxes, completed
steps and supporting notes. It supplies explicit work-record actions for Markdown
links on the parent or its children, resolved relative to the TODO index. The
preview still shows only the next open step and progress. This view does not edit
checkboxes or task files.

A program that exits with an error keeps its last cards on screen and shows the
last line of its error output above them.

## Jira board

`cardfile-jira` (from the `bin` package) is a board source for Jira Cloud. It
calls Jira's REST API directly as you, so you can browse, move, comment on and
edit issues from the board. It needs Python 3.9 or later and nothing else.

Put its settings in the board's entry in `cardfile.local.json`, under `jira`,
because they name your site, your account and your project:

```json
{
  "boards": [{
    "id": "jira", "label": "Jira", "run": ["~/bin/cardfile-jira"], "timeout": 60,
    "jira": {
      "site": "example.atlassian.net",
      "email": "you@example.com",
      "token": "keychain:jira-api-token",
      "project": "PROJ"
    }
  }]
}
```

`token` says where your [API token](https://id.atlassian.com/manage-profile/security/api-tokens)
lives, never the token itself:

- `"env:JIRA_API_TOKEN"`: an environment variable Herdr App can see.
- `"keychain:SERVICE"`: a macOS keychain item. Add one with
  `security add-generic-password -s jira-api-token -a "$USER" -w`. Use
  `"keychain:SERVICE/ACCOUNT"` to pick the account.
- `"op://vault/item/field"`: a 1Password reference, read with `op read`.

With only those settings you get three lanes, one per status category (To Do,
In Progress, Done), and **Mine** and **Team** views. The rest is optional:

| `jira` field | Meaning |
| --- | --- |
| `project` / `jql` | The issues: a project key, or any JQL (without `ORDER BY`). |
| `excludeTypes` | Issue types to leave off, such as `["Epic"]`. |
| `lanes` | Lanes in board order, each `{ "id", "label", "status" or "statuses", "tone" }`, or `"category"` in place of statuses. `"final": true` lets only the issue's assignee move it there. `"max": 50` gives a long lane its own query and keeps the 50 most recently updated. |
| `views` | `[{ "id", "label", "jql" }]`, where `jql` narrows the view. The default is Mine (`assignee = currentUser()`) and Team. |
| `order` | The board's `ORDER BY` (default `Rank ASC`). |
| `doneDays` | How long Done issues stay on the board (default 14). |
| `priorityTones` | Priority name to card tone, such as `{ "Highest": "blocked" }`. |
| `quietPriority` | A priority not worth naming on cards (default `Medium`). |
| `estimateField` | A custom field to show as Estimate, such as `customfield_10016`. |
| `title` | The board's name in the header. |

**Move** offers only the statuses Jira's workflow allows from where the issue is.
Comments and descriptions are markdown, converted to and from Jira's document
format. Mentions, panels, images, checklists and some other formatting can't be
written back, so the drawer warns before a description save that would flatten
them.

`cardfile-jira md-to-adf` and `cardfile-jira adf-to-md` run the converters on
standard input, with no network. `bin/tests/cardfile-jira.test.sh` tests them.

## Editing

Herdr does not see edits made through the Stow symlink, so it keeps running the
old version. After editing `main.js` in the repo, touch the link
(`touch -h ~/.config/herdr-app/mods/cardfile/main.js`). If that is not enough,
switch layouts away and back. Check the mod with
`herdr-app check ~/.config/herdr-app/mods/cardfile`.

The mod is a single file on purpose: Herdr refuses `import "./x.js"` when the
file resolves outside the mod folder, which every Stow link does.
