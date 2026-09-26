# Changelog

Notable changes to this dotfiles repository are recorded here, following [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added

- Add a Stow-managed Herdr config with a tmux-like backtick prefix and Dracula theme.
- Add a portable Herdr setup with a committed manifest plus `scripts/setup-herdr` and `scripts/bootstrap` to reproduce integrations and plugins.
- Add a lazy-loaded Atlassian MCP server to Pi through a local `atlassian-mcp` wrapper on `PATH`, and document the existing Xcode MCP server.
- Add Go binaries to `PATH` in zsh when Go is installed.
- Track cmux terminal config as a `cmux` stow package.

### Changed

- Switch Pi's default and active Sol/Luna routes to GPT-6, prioritize Codex in the scoped model cycle, and route subagents to GPT-6 while retaining GPT-5.6 Terra as a selectable fallback.
- Make `git pull` rebase and autostash by default, so a diverged branch with local edits pulls without extra flags.

### Removed

- Remove the hardcoded cua-driver `PATH` entry from zsh. A machine that installs cua-driver outside an existing `PATH` entry needs to add `$HOME/.local/bin` locally.

### Fixed

- Fall back to the Anthropic summary model when a Codex conversation-summary request fails, not only when Codex is unconfigured, and warn once per session when it happens.
