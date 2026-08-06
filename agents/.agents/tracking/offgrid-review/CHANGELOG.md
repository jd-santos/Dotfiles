# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).
This project does not currently declare a Semantic Versioning policy.

## Unreleased

### Added

- Add the dependency-free `offgrid-review` Python CLI with UVX execution,
  version output, protected starter-spec generation, and concise command errors.
- Add queue-based and complete planning-document review with multi-select
  decisions, explicit single-select questions, granular notes, conflicts,
  summaries, persistence, and decision JSON export.
- Add semantic tables, flows, timelines, dependency graphs, charts, constrained
  SVG, and visible text alternatives.
- Add schema, generator, review, data, specification, and artifact identity to
  generated files and decision exports.
- Add path-aware input validation for IDs, types, references, source paths,
  collection limits, and reserved export fields.
- Add focused browser regressions for persistence, regenerated artifacts,
  hostile raw-text data, mobile document review, focus return, and text reflow.
- Add generated desktop and mobile screenshots with a standard-library capture
  script.

### Changed

- Reframe the public quick start around the agent-to-human review workflow and
  use checked-in inputs for runnable CLI examples.
- Reserve exact UVX version pins for reproducibility, use the unversioned PyPI
  command after publication, and distinguish macOS manual testing from Ubuntu
  CI coverage.
- Split validation, identity, queue rendering, document rendering, SVG handling,
  page assembly, and browser resources into separate package boundaries.
- Require stable source item IDs and prefer those IDs over mutable paths when
  constructing decision identities.
- Scope browser storage to a review ID and load it only when its schema and
  artifact fingerprint match the current file. Pre-release title-only storage
  is intentionally not migrated.
- License the Python generator and aggregate package under GPL-3.0-or-later,
  while licensing the generated runtime and reusable output templates under
  Apache-2.0. Generated HTML carries the Apache license and notice.
- Rename reviewer-facing JSON actions to **Download decisions**, **Copy
  decisions**, and **Preview decisions** while retaining JSON as the exchange
  format.
- Keep the agent skill as the discovery and workflow layer while the CLI package
  owns deterministic execution.

### Fixed

- Prevent decisions from an older artifact from inflating progress or appearing
  in a regenerated review export.
- Encode embedded JSON safely for HTML raw-text parsing so source strings such
  as `<!--<script>` cannot disable the browser runtime.
- Return focus to the review-summary trigger after closing the panel.
- Keep planning documents within the viewport at high text scaling.
- Report malformed data and specifications without exposing Python tracebacks.

## 2026-08-03

### Added

- Add the standard-library offline review generator and agent skill.
- Add the first review workbench interface, artifact documentation, product
  contract, and design contract.
