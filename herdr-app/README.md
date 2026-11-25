# Herdr App

The desktop window uses `~/.config/herdr-app/`, independently of the legacy
Herdr TUI's `~/.config/herdr/config.toml`. The [`herdr-core`](../herdr-core/)
package configures the terminal backend.

This package carries over Dracula and disabled sounds from the TUI, preserves
120% app zoom, and uses the app's direct shortcuts instead of the TUI's backtick
prefix. It leaves `keys.json` app-managed so untouched default shortcuts can
receive upstream updates. TUI-specific sidebar rows, character-based sidebar
width, pane framing, copy/resize modes, and system-toast delivery are not ported.
The app's shipped layout and notification behavior remain in place.

## Install

Install GNU Stow and `jq` first. Herdr App and Core are installed separately;
these dotfiles do not install their binaries.

Back up existing settings and any custom `themes/dracula.json` outside this
checkout first. Keep `settings.json` in place: the merger preserves settings
that the shared defaults do not manage. Back up an existing Core config before
stowing that package too.

From the checkout:

```bash
# Migrate the old settings symlink before Stow, or create local settings.
./bin/bin/merge-settings --herdr-app-only
stow --no-folding --target="$HOME" herdr-app herdr-core
herdr-app status
```

The merger recognizes this checkout's previous `settings.json` symlink and
replaces it with a regular local file without changing the old target. It also
handles that link after the tracked file has been renamed. Other `settings.json`
symlinks are refused: back up their contents and replace the link with a local
regular file before retrying.

Use `--no-folding` so Herdr's folders stay on the machine, with only your chosen
files linked into this repo. Do not use `--adopt` to import the app's whole home.
The app reloads settings and themes live; check `status` for errors rather than
relying on the last good screen.

## Shared and local settings

`settings.base.json` is tracked and linked by Stow. `settings.json` is a regular
local file that Herdr can update without changing Git. `merge-settings` combines
these files in this order, with later values winning:

1. Existing `settings.json`, preserving app-saved settings outside shared defaults.
2. Tracked `settings.base.json`, applying the shared preferences.
3. Optional local `settings.local.json`, for deliberate machine-specific overrides.

Objects merge recursively; arrays and other values are replaced. For example,
put this in `~/.config/herdr-app/settings.local.json` to use a different zoom and
worktree folder on one machine:

```json
{
  "zoom": 1.4,
  "worktrees": { "directory": "~/Developer/worktrees" }
}
```

Run `merge-settings --herdr-app-only` after changing the base or local overrides.
Plain `merge-settings` and bootstrap also include Herdr App. The focused option
does not touch Pi, Claude Code or Zed. The merger honors `HERDR_APP_HOME`, then
`XDG_CONFIG_HOME`; Stow still targets the default path, so custom app homes need
their base/theme files deployed separately. Keep custom app homes outside this
checkout; the merger does not enforce that boundary for explicit path overrides.

App-side changes take effect immediately. At the next merge, shared settings
such as zoom return to the base value unless overridden in `settings.local.json`.
Unmanaged settings stay as Herdr saved them. Removing an override returns a
shared setting to its base value; a setting absent from the base remains in the
live file until removed there too. Invalid JSON leaves the live file unchanged.

A layout's own look and saved theme-picker choice can override settings. Existing
layout choices are not reset by installing this package. Layouts, mods and themes
remain ordinary Stow-managed files; runtime state does not go through the merger.

## Card File layout

`layouts/cardfile.json` is the shipped main layout redone as index cards. The
sidebar stacks spaces over agent cards, and the side panel to the right of the
terminals has Files, Changes and Todo as tabs. Switch to it with
`ctrl-shift-l`. **Board** in the tab bar swaps the terminals for a board of
agents in lanes by your call on each: Needs you and Review fill themselves,
Parked and Done are yours, and running agents sit in a narrow strip. The
`cardfile` mod draws the sidebar, the panel tabs, Todo and the board, and
`themes/cardfile.json` gives it warm
grays with a blush accent. Todo cards come from small programs listed in
`cardfile.json`; the shared list runs
`~/bin/cardfile-todo` (from the `bin` package), which reads the shown repo's
`todo/TODO.md`. See the [mod's README](.config/herdr-app/mods/cardfile/README.md)
for the card and board source contracts. Todo titles wrap; **Details** shows the
full inline checklist and notes, with **Open work item** links for parent and
child work records. **Work item** opens the parent record directly. `~/bin/cardfile-jira` puts a Jira
Cloud project on the board; its settings go in the untracked
`cardfile.local.json`.

## Default macOS shortcuts

These are app defaults, not custom bindings maintained by this repo.

| Shortcut | Action |
| --- | --- |
| `Cmd+T` | New tab |
| `Cmd+D` / `Cmd+Shift+D` | Split right / down |
| `Cmd+Option+Arrow` | Focus neighboring pane |
| `Cmd+Shift+W` | Close pane |
| `Cmd+Shift+Enter` | Zoom pane |
| `Cmd+1…9` | Select tab |
| `Ctrl+1…9` | Select space |
| `Cmd+F` | Search terminal history |
| `Cmd+Shift+P` | Command palette |
| `Cmd+,` | Settings |

Resize by dragging dividers. Select terminal text directly and copy with
`Cmd+C`; there is no built-in tmux-style copy mode or config-reload shortcut.

## Portable customization

Track deliberate personal files, not a snapshot of `~/.config/herdr-app/`:

- `settings.base.json` and, if customized later, `keys.json`
- Custom `themes/*.json`
- Personal `layouts/*.json`
- Personal `mods/<name>/main.js`, `mod.json`, and required assets/fonts

Clone shipped layouts or mods with `layout.clone` / `mod.clone` before editing
them. Shipped files are replaced on startup. Custom mods are trusted JavaScript
with command and network access; review third-party code and assets before
installing or publishing them.

Keep local `settings.json` and `settings.local.json`, generated `AGENTS.md`,
`.d.ts` files, shipped mods/layouts/themes, sockets,
`layouts/.state/`, `shared.json`, `view.json`, `window.json`, `windows.json`,
`data/`, telemetry, update caches, and other runtime bookkeeping out of Git.
Personal assets must use portable paths and have redistribution permission.
The installed `AGENTS.md` and type declarations describe the API supported by
the installed app; read them locally rather than vendoring generated copies.
