# Changelog

Notable changes to this dotfiles repository are recorded here, following [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Added

- Add a Stow-managed Herdr config with a tmux-like backtick prefix and Dracula theme.
- Add a portable Herdr setup with a committed manifest plus `scripts/setup-herdr` and `scripts/bootstrap` to reproduce integrations and plugins.
- Add a lazy-loaded Atlassian MCP server for optional local use through an
  `atlassian-mcp` wrapper on `PATH`, and document the existing Xcode MCP server.
- Add a Parallel Task server to Pi's native MCP configuration and a skill for
  approved research and data enrichment.
- Add Go binaries to `PATH` in zsh when Go is installed.
- Track cmux terminal config as a `cmux` stow package.
- Add a `herdr-jd` Pi bridge that publishes a conversation short title to the Herdr Agent sidebar, generated in the same summary model call.

### Changed

- Switch Pi's default, scoped Sol routes, and Sol subagents to GPT-6.1 Sol while keeping GPT-6 Luna and GPT-5.6 Terra selectable.
- Switch Pi to native MCP support with tracked Svelte and Xcode defaults,
  private local server overrides, and generated MCP settings.
- Put Pi's glyph beside the location in Herdr's Agent sidebar and show the conversation title alone on the next row.
- Widen the Herdr sidebar to 40 columns and disable onboarding and automatic theme switching.
- Switch Pi's default and active Sol/Luna routes to GPT-6, prioritize Codex in the scoped model cycle, and route subagents to GPT-6 while retaining GPT-5.6 Terra as a selectable fallback.
- Keep Pi documentation and macOS metadata out of the Stow target so `stow pi` installs cleanly.
- Make `git pull` rebase and autostash by default, so a diverged branch with local edits pulls without extra flags.

### Removed

- Remove Pi's MCP adapter and the Brave Search server from the retained
  generic MCP config.
- Remove the hardcoded cua-driver `PATH` entry from zsh. A machine that installs cua-driver outside an existing `PATH` entry needs to add `$HOME/.local/bin` locally.

### Fixed

- Enable 1Password desktop prompts for Pi launched in Herdr on macOS unless
  explicitly overridden.
- Fall back to the Anthropic summary model when a Codex conversation-summary request fails, not only when Codex is unconfigured, and warn once per session when it happens.
