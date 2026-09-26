# Herdr setup portability

Status: Ready for review

## Purpose

Make Herdr agent integrations and plugins reproducible from this Dotfiles
checkout without running a separate install command for every plugin on every
machine.

Herdr registers plugins imperatively and keeps no declarative plugin list, so
there is no committed file Herdr itself reads to recreate them. This work adds
that missing desired-state layer: a small committed manifest plus idempotent
reconcile scripts. The setup then matches the model Pi already uses, where a
committed declaration plus a reconcile step reproduces installed state.

## Decisions

- Keep the manifest in the `herdr` stow package at
  `.config/herdr/herdr-setup.toml`. Herdr does not read it; `scripts/setup-herdr`
  does.
- List agent integrations and GitHub plugins in one TOML file. Plugins carry an
  optional `ref` so versions can be pinned for deterministic reproduction.
- Do not vendor third-party plugin code into this public repository. GitHub
  plugin installs clone into Herdr's managed data directory instead.
- Vendor no integration files either. `setup-herdr` installs them, which keeps
  them current with the installed Herdr version and avoids stale copies.
- Ignore the generated Pi integration file in the repo `.gitignore`. The Pi
  extensions directory is a stow symlink, so the generated file lands inside the
  working tree.
- Add `scripts/bootstrap` as the single entry point for a new machine: skills
  submodule, stow, merged settings, and Herdr reconcile.

## Checklist

- [x] Add `herdr/.config/herdr/herdr-setup.toml` manifest.
- [x] Add `scripts/setup-herdr` to reconcile integrations and plugins.
- [x] Add `scripts/bootstrap` for one-command machine setup.
- [x] Ignore the generated Pi integration file in `.gitignore`.
- [x] Update root `README.md` package table, install flow, and changes table.
- [x] Note the generated integration file in `pi/README.md`.
- [x] Add this work to the root `TODO.md` index.
- [x] Validate: `bash -n`, a manifest parse, and an idempotent `setup-herdr` run.
- [x] Address reviewer findings (missing-Herdr skip, TSV validation, uninstall errors).

## Validation

- `bash -n` passed for `scripts/setup-herdr` and `scripts/bootstrap`.
- Manifest parses with `tomllib`: `integrations = ["pi"]`, no plugins declared.
- `./scripts/setup-herdr` installed the Pi integration to
  `~/.pi/agent/extensions/herdr-agent-state.ts`; `herdr integration status`
  reports `pi: current (v9)`.
- Re-running `./scripts/setup-herdr` reports `already installed` without
  reinstalling. `--refresh` reinstalls and reports success.
- The generated file is matched by `.gitignore`, so it does not dirty
  `git status`.
- `stow --target="$HOME" -n -R` with the `bootstrap` package list exited 0.
- `git diff --check` passed.
- Isolated stub test with a fake `herdr` in a throwaway git repo confirmed
  plugin reconcile: two runs each issued `plugin install owner/repo/subdir
  --ref v1.0.0 --yes` and `plugin install owner/other --yes`, while the `pi`
  integration was skipped as `current`.
- Missing `herdr` exits 1; `--allow-missing-herdr` exits 0.
- The parser rejects tabs or newlines in fields, an empty plugin source, and a
  non-array `integrations` value, each with exit 1.

## Review

Fresh correctness and design reviewers assessed the change. Findings and
dispositions:

- Missing Herdr exited 0, so `bootstrap` could report success without applying
  declared setup. Fixed: `setup-herdr` exits 1 when the manifest declares work
  and `herdr` is absent, with an explicit `--allow-missing-herdr` opt-out.
  `bootstrap` requires `herdr` and `python3` up front, and the README lists
  prerequisites.
- Manifest values were written into tab-separated fields without validation.
  Fixed: the parser rejects non-strings, empty values, and embedded tabs or
  newlines.
- Uninstall failures were discarded during `--refresh` and outdated handling.
  Fixed: a failed uninstall is tolerated only when status shows the integration
  is absent; real cleanup failures propagate.
- Plugin idempotence was asserted but untested. Fixed by the isolated stub test
  above. Herdr reinstalls replace the managed checkout, so re-running is the
  intended refresh path.
- The trust boundary was not visible in the public instructions. Fixed: the
  README warns that plugin installs run third-party code and recommends pinning
  `ref`.

No blocker was raised. Residual risk: an unpinned plugin can vary as its
upstream source changes; pin `ref` when reproducibility matters.

## Acceptance

- A new machine needs only `git clone`, then `./scripts/bootstrap`, to reproduce
  stowed config, generated settings, Herdr integrations, and declared plugins.
- `scripts/setup-herdr` is idempotent and safe to re-run, with `--refresh` to
  pick up integration changes after a Herdr update.
- No third-party plugin or integration code is committed to the repository.
- The generated Pi integration file does not dirty `git status`.

## Known limitations

- GitHub plugin installs need `git` on the target machine and any build
  toolchains a plugin declares (`npm`, `bun`, `cargo`, and so on). Herdr does not
  install missing toolchains.
- Plugins without a GitHub source cannot be declared here; they need a local
  `herdr plugin link` and a private source of truth.
- Installing a plugin runs third-party code as the user.