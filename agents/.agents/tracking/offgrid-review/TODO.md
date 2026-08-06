# TODO

## In Progress

- [ ] Finish the `0.1.0` release
  - [x] Rearchitect and harden the release candidate
  - [x] Add browser and distribution regression coverage
  - [ ] Decide when the candidate is ready to publish
  - [ ] Configure the protected GitHub `pypi` environment
  - [ ] Register the pending PyPI Trusted Publisher
  - [x] Confirm the hardened CI workflow succeeds on `main`
  - [ ] Replace temporary Git-source commands with `uvx offgrid-review`
  - [ ] Publish GitHub release `v0.1.0`
  - [ ] Verify `uvx offgrid-review@0.1.0` from PyPI
  - [ ] Sync the published skill and tested package contract into Dotfiles

## Up Next

- [ ] Run Ruff cleanup and decide whether Ruff belongs in CI
- [ ] Show recommendation provenance and supporting evidence
- [ ] Add operational risk, reversibility, evidence-strength, and ambiguity signals
- [ ] Add optional per-action confirmation friction
- [ ] Import decision JSON with schema and snapshot compatibility checks

## Backlog

- [ ] Add risk-tiered approval queues and escalation rules
- [ ] Build a snapshot-aware apply loop with fingerprints and apply reports
- [ ] Add safe bulk decisions with exception previews
- [ ] Add concrete before-and-after previews
- [ ] Add constrained reusable diff, comparison, and evidence components
- [ ] Explore an optional hosted mode while preserving offline artifacts

## Done

- [x] Rearchitect and harden the pre-PyPI package, artifact contract, browser runtime, validation, accessibility, licensing, tests, and release automation
- [x] Build the dependency-free Python CLI release candidate with UVX, CI, and a thin agent skill
- [x] Publish the public README, generated screenshots, capture script, and changelog
