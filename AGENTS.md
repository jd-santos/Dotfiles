# AGENTS.md

Personal dotfiles managed with GNU Stow. Each top-level package directory is
deployed with `stow <package>`; `README.md` lists which directories are packages.

## Rules

- **This repo is public on GitHub.** Do not add private information: API keys,
  tokens, passwords, personal identifiers, work-specific configuration, or
  internal URLs. If a request would expose any of these, say so and suggest an
  alternative such as an environment variable, a gitignored local file, or a
  private overlay.
- **Packages mirror `$HOME`.** `~/.config/foo/bar` lives at
  `foo/.config/foo/bar`, not `foo/bar`.
- **There is no build or test command.** Each tool validates its config when it
  loads it, so keep edits syntactically valid for that tool.
- **Keep the README shortcut tables in sync.** When you add, change, or remove a
  custom keybinding in `tmux/.tmux.conf`, `herdr/.config/herdr/config.toml`,
  `claude/.claude/keybindings.json`,
  `nvim/.config/nvim/lua/config/keymaps.lua`, or
  `nvim/.config/nvim/lua/plugins/*.lua`, update "Keyboard Shortcuts" in
  `README.md`. List only custom bindings, not LazyVim defaults.
- **Pi features belong in the `pi` package.** Put Pi prompts, extensions,
  themes, skills, and `settings.base.json` under `pi/.pi/agent/`, which stows to
  `~/.pi/agent/`. Edit there rather than in `~/.pi` unless asked for a
  machine-local change.
- **Claude Code features belong in the `claude` package.** Keybindings, shared
  settings (`settings.base.json`, merged by `merge-settings`), and mods under
  `claude/.claude/mods/` stow to `~/.claude/`. Update the mod's README when its
  behavior changes.
- **New stow packages need three updates:** the README package table, the
  install lists in `README.md`, and the `packages` array in `scripts/bootstrap`.
- **Skills live in the `agents/.agents` submodule**, a separate repository.
  Commit skill changes there, then bump the submodule here. Use the
  `create-skill` skill when writing one.

## Secrets

Do not read files that may contain secret values, even to debug: `.env*`,
`*credentials*`, `*secrets*`, `*token*`, `*.key`, `*.pem`, `.aws/credentials`,
and `.ssh/id_*`. Redacting does not help, because you see the value before you
redact it. Instead, ask the user about the file's format and give them commands
to run, such as `bash -n .env` and `file .env`.

Varlock schema files (`.env.schema`, `.env-schema`) are the exception. They hold
variable names, types, validation, and resolvers such as `op(...)`, and are safe
to read. If one appears to contain a literal secret, stop and ask the user to
check it.
