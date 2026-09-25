# Changelog

Notable changes to this dotfiles repository are recorded here, following [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

### Changed

- Switch Pi's default and active Sol/Luna routes to GPT-6, prioritize Codex in the scoped model cycle, and route subagents to GPT-6 while retaining GPT-5.6 Terra as a selectable fallback.

### Fixed

- Fall back to the Anthropic summary model when a Codex conversation-summary request fails, not only when Codex is unconfigured, and warn once per session when it happens.
