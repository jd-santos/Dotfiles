# Herdr Core

`hc` runs persistent terminals. Its settings live in
`~/.config/herdr-core/config.toml`; window appearance and keyboard shortcuts
belong to the separate [`herdr-app`](../herdr-app/) package.

```bash
stow --no-folding --target="$HOME" herdr-core
```

Back up an existing config outside the checkout before stowing. Keep directories
unfolded so future machine-local files do not land in Git.

The tracked config makes two documented defaults explicit: a 60-second draft
hold for sends/notes, and no saved-screen replay above a recovery shell. It does
not override the machine's shell. No service installation, terminal launch,
server restart, or environment replacement is performed by this package.

Run `hc --help` and `hc --skill` for the installed version's options. Agent
instructions/templates can also be tracked as deliberate personal files under
`~/.config/herdr-core/templates/`, but this package does not install any yet.
Keep connection profiles, session state, logs, and private environment data
machine-local rather than importing the entire Core home into this public repo.
