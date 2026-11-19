# Card File

Herdr App's sidebar and side panel, redone as index cards. The sidebar stacks
spaces over agent cards. The side panel, right of the terminals, holds
**Files**, **Changes** and **Todo** as tabs. Todo shows cards from card
sources (plugins).

The `cardfile` layout uses it, with the `cardfile` theme. Switch with
`ctrl-shift-l` or `herdr-app do layout.switch '{"name":"cardfile"}'`. Open the
panel from **Files**, **Changes** or **Todo** in the tab bar. Todo's button is
a separate `cardfile` block after Herdr's tab bar, so the shipped tab bar stays
unmodified and keeps getting updates.

## Agent cards

Each card shows:

1. The agent's title (Claude Code names its session) and its status.
2. What it reports it is doing now, up to two lines.
3. Its space and tab, helpers it started, its turn, and how long it has been in
   this state.

Click a card to focus that agent. **This space** shows the shown space's agents.
Agents elsewhere that need you or have finished still get a line under
**Other spaces**. **All** shows every agent. `agent.next` and `agent.prev`
follow the order on screen.

## Card sources

A source is any program that prints cards as JSON. It can be a shell script,
Python, or anything that calls an API, such as Jira's.

### Where sources are listed

- `~/.config/herdr-app/cardfile.json` is shared and stowed from this repo.
- `~/.config/herdr-app/cardfile.local.json` is for this machine only and is not
  in the repo. Put work sources, such as Jira, here.

A local source with the same `id` changes that source's fields, and
`"enabled": false` turns it off. `agent` is the command **Start agent** runs.
The config is reread every 30 seconds.

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
| `title` | One line. |
| `lines` | Up to three lines. The first may wrap to two. |
| `tag` | A short chip before the title: a priority, a ticket key. |
| `tone` | Colors the tag and the line under the title: `blocked`, `working`, `done`, `idle`, `accent` or `muted`. |
| `progress` | `[done, total]`, drawn as a small bar. |
| `file` | Clicking the card opens this file as markdown in a dialog. |
| `url` | With no `file`, clicking opens this link. With a `file` too, the card gets a **Link** button. |
| `task` | Adds **Start agent**, which opens a tab in the shown space running `agent` with this as its first message. |

A program that exits with an error keeps its last cards on screen and shows the
last line of its error output above them.

## Writing a Jira source

Keep the script and its configuration out of this public repo. Put the script
somewhere local, read the token from the environment or 1Password (for example
`op read`), and list it in `cardfile.local.json`:

```json
{ "sources": [{ "id": "jira", "label": "Jira", "run": ["~/.local/bin/cardfile-jira"], "where": "home", "every": 300 }] }
```

Map each issue to a card: the key as `tag`, the summary as `title`, the status
and assignee as `lines`, the browse link as `url`, and a `task` that names the
key so an agent can pick it up.

## Editing

Herdr does not see edits made through the Stow symlink, so it keeps running the
old version. After editing `main.js` in the repo, touch the link
(`touch -h ~/.config/herdr-app/mods/cardfile/main.js`). If that is not enough,
switch layouts away and back. Check the mod with
`herdr-app check ~/.config/herdr-app/mods/cardfile`.

The mod is a single file on purpose: Herdr refuses `import "./x.js"` when the
file resolves outside the mod folder, which every Stow link does.
