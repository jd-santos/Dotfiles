# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).
This project does not currently declare a Semantic Versioning policy.

## Unreleased

### Added

- Add a dependency-free Python package with the `offgrid-review` command, UVX
  support, version output, and concise command errors.
- Add CLI regression coverage and build metadata for wheel and source
  distributions.
- Add a public project overview with generated desktop and mobile screenshots.
- Add a standard-library script for regenerating the screenshot set with Chrome
  or Chromium.

### Changed

- Move the renderer into the importable `offgrid_review` package without
  changing generated review output.
- Keep the agent skill as the discovery and workflow layer while the published
  CLI owns deterministic execution.

## 2026-08-03

### Added

- Add the standard-library offline review generator and agent skill.
- Add queue-based and complete planning-document review workflows.
- Add multi-select decisions, explicit single-select questions, granular notes,
  validation, summaries, persistence, and decision JSON export.
- Add semantic tables, flows, timelines, dependency graphs, charts, constrained
  SVG, and visible text alternatives.
- Add responsive desktop and mobile layouts with light and dark themes.
- Add artifact, usage, apply-pass, product, and design documentation.
