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
- Add the `shellfish` Claude Code mod and a local `dotfiles-mods` plugin marketplace under the `claude` stow package. The band above the prompt shows workspace, model, effort, a context bar coloured by category, rate-limit gauges, and estimated API cost; each turn's closing line becomes a receipt; the shelf pane shows subagents, context, turn, limit, and prompt-cache figures with a one-hour cache countdown and an opt-in `/keepalive` that re-reads the cache before it lapses; a per-turn usage log lands in `~/.claude/shellfish/`.
- Track shared Claude Code settings in `claude/.claude/settings.base.json`, which `merge-settings` merges into the machine-local `~/.claude/settings.json`: no commit or PR attribution, and the `dotfiles-mods` marketplace with `shellfish` enabled.
- Add Claude Code keybindings: `Shift+Tab` cycles effort, `Option+m` cycles permission mode, and `Option+.` / `Option+,` cycle a model shortlist, all for the current session only.
- Add a `herdr-jd` Pi bridge that publishes a conversation short title to the Herdr Agent sidebar, generated in the same summary model call.

### Changed

- Bring a few `shellfish` ideas to the Pi prompt: the context meter marks the 80% automatic compaction point with `┃`, both prompt borders take the accent colour while a run is in progress, each prompt gets a rule labelled with its send time, and each finished run ends with a one-line receipt (`✓ 42s · 3.1k out · 61 t/s · $0.210 · ctx 31%`) instead of a speed notification. Live generation speed moves from the footer into the working spinner, so the footer holds still while a response streams.
- Redesign the `shellfish` band: row 1 carries the session summary after the branch; row 2 labels each group (`ctx`, `cost`, `cache`), shows the 5-hour and 7-day rate limits as percentages instead of one-cell gauges, and separates groups with dim dividers. The shelf asks for a 52-column dock instead of half the screen. Running subagents get a row each under the band until they finish, and the shelf's Agents section is always present with a running count in its header. The permission-mode label now reads Claude Code's own footer mode indicator instead of a classic hook field that never arrived, so it no longer sits at `?`. The band's `shelf` button and `/shelf` toggle the shelf instead of only opening it. The context bar refreshes its categories when the conversation compacts, and falls back to a plain meter while a stale breakdown disagrees with the live percent.
- Alias `cat` to `bat` only when `bat` is installed. On a machine without it, every `cat` failed with "command not found: bat", which broke scripts and agent sessions.
- Slim `AGENTS.md` from 122 to about 40 lines, keeping only rules an agent would
  otherwise get wrong and merging the duplicated secrets guidance.
- Point Pi feature guidance at the `pi` stow package and drop the stale repo-local
  `.pi/` README row.
- Bump the skills submodule for modernized authoring skills, spec-compliant
  frontmatter, and the collection's move to Apache-2.0.
- Restructure the Pi README around setup differences and component roles, with editable prompt and permission-flow illustrations.
- Raise Pi's automatic compaction threshold from 70% to 80% of the configured model context window, without changing model limits or pricing tiers.
- Switch Pi's default, scoped Sol routes, and Sol subagents to GPT-6.1 Sol while keeping GPT-6 Luna and GPT-5.6 Terra selectable.
- Switch Pi to native MCP support with tracked Svelte and Xcode defaults,
  private local server overrides, and generated MCP settings.
- Put Pi's glyph beside the location in Herdr's Agent sidebar and show the conversation title alone on the next row.
- Widen the Herdr sidebar to 40 columns and disable onboarding and automatic theme switching.
- Switch Pi's default and active Sol/Luna routes to GPT-6, prioritize Codex in the scoped model cycle, and route subagents to GPT-6 while retaining GPT-5.6 Terra as a selectable fallback.
- Keep Pi documentation and macOS metadata out of the Stow target so `stow pi` installs cleanly.
- Make `git pull` rebase and autostash by default, so a diverged branch with local edits pulls without extra flags.

### Removed

- Retire Pi's `/plan` prompt and mandatory two-round planning instructions. Pi's task-capture rules apply now; shared `work-routing` is available after pinning a Skills commit that contains it.
- Remove Pi's MCP adapter and the Brave Search server from the retained
  generic MCP config.
- Remove the hardcoded cua-driver `PATH` entry from zsh. A machine that installs cua-driver outside an existing `PATH` entry needs to add `$HOME/.local/bin` locally.

### Fixed

- Stop tracking `lastChangelogVersion` in Pi's settings base so `merge-settings` no longer downgrades the version Pi writes at runtime, and clear the stale machine-local Pi defaults that predate the Codex routing.
- Use `openai-codex` for Pi's default and OpenAI subagent routes, remove OpenRouter OpenAI models from the shortlist, and add Codex Astra as a selectable model.
- Pin `pi-subagents` to `0.78.0` for the upstream background-startup fix on Pi hosts that no longer ship `chord`.
- Stow the `claude` package from `scripts/bootstrap` and the README install lists, and sync stale Pi permission, zsh, and shellfish docs with current behavior.
- Ignore Pi Lens runtime state in the Stow package while keeping its shared config tracked.
- Enable 1Password desktop prompts for Pi launched in Herdr on macOS unless
  explicitly overridden.
- Fall back to the Anthropic summary model when a Codex conversation-summary request fails, not only when Codex is unconfigured, and warn once per session when it happens.
