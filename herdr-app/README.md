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

With Herdr App installed, back up any existing `settings.json` and custom
`themes/dracula.json` outside this checkout before installing:

```bash
stow --no-folding --target="$HOME" herdr-app herdr-core
herdr-app status
```

Use `--no-folding`: runtime directories must remain real directories, with only
individual configuration files symlinked into this repo. Do not use `--adopt`
to import the app's whole home. The app reloads settings and themes live; check
`status` for errors rather than relying on the last good screen.

Edit the versioned files here to change preferences. App-side settings changes
can change the deployed file or replace its symlink; check `git diff` and the
link before assuming those changes are tracked. A layout's own look and saved
theme-picker choice can override settings. Existing layout choices are not reset
by installing this package.

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

- `settings.json` and, if customized later, `keys.json`
- Custom `themes/*.json`
- Personal `layouts/*.json`
- Personal `mods/<name>/main.js`, `mod.json`, and required assets/fonts

Clone shipped layouts or mods with `layout.clone` / `mod.clone` before editing
them. Shipped files are replaced on startup. Custom mods are trusted JavaScript
with command and network access; review third-party code and assets before
installing or publishing them.

Keep generated `AGENTS.md`, `.d.ts` files, shipped mods/layouts/themes, sockets,
`layouts/.state/`, `shared.json`, `view.json`, `window.json`, `windows.json`,
`data/`, telemetry, update caches, and other runtime bookkeeping out of Git.
Personal assets must use portable paths and have redistribution permission.
The installed `AGENTS.md` and type declarations describe the API supported by
the installed app; read them locally rather than vendoring generated copies.
