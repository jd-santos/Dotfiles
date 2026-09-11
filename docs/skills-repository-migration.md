# Skills repository migration

Status: Completed on 2026-09-11. The standalone repository is published at
[`jd-santos/Skills`](https://github.com/jd-santos/Skills) and pinned here as the
`agents/.agents` submodule.

## Problem

The reusable agent skills currently live inside the Dotfiles repository at
`agents/.agents/skills`. That makes installation through GNU Stow convenient,
but it ties the public identity and release history of the skills to the broader
dotfiles project.

Move the skills into a standalone public repository while preserving these
properties:

- Skills remain compatible with Pi, Claude Code, OpenCode, and other Agent
  Skills consumers.
- `~/.agents/skills` remains the installed discovery path.
- A Dotfiles checkout installs a known skills revision rather than whichever
  commit happens to be current.
- A person can use the skills repository without adopting the Dotfiles
  repository.
- Third-party skill text is not committed to the new repository.
- Third-party sources receive clear attribution and are installed only from
  reviewed, pinned commits.
- Installation does not depend on `npx skills`.

## Chosen approach

Create a standalone skills repository and include it in Dotfiles as a standard
Git submodule at `agents/.agents`.

The standalone repository root will be shaped for direct installation:

```text
agent-skills/
├── README.md
├── LICENSE
├── .gitignore
├── docs/
├── skills/
├── scripts/
└── tracked-skills.json
```

The Dotfiles repository will contain:

```text
agents/
└── .agents/    # Git submodule
```

This preserves the current Stow mapping:

```text
agents/.agents/skills/  ->  ~/.agents/skills/
```

It also lets someone install the standalone repository directly:

```bash
git clone https://github.com/<owner>/<skills-repo>.git ~/.agents
```

Dotfiles will pin the submodule to a reviewed commit. It will not configure the
submodule to follow `main` automatically.

## Third-party skill policy

### Committed content

Commit only skills maintained in the standalone repository. Do not commit
upstream repository snapshots or generated copies of externally maintained
skills.

The initial external-source inventory includes:

- `informed-patient`
- `learning-opportunities`
- `orient`
- `offgrid-review`, whose canonical source remains its existing repository

Confirm the ownership and canonical source of every current skill before
extraction. A skill already maintained in another repository should use the
external-source flow even when both repositories have the same owner.

### Source registry

Keep a small registry of optional external skills in `tracked-skills.json`. Each
entry should contain enough information to reproduce and credit the
installation:

- Installed skill name
- Upstream repository URL
- Exact reviewed commit
- Skill path within the upstream repository
- Upstream project and author display name
- License identifier and license source path or URL
- Last review date

Branches may be recorded as update hints, but installation must use the pinned
commit.

### Local materialization

Replace the committed `tracking/` snapshots with a local source cache. The
installer will:

1. Read the external-source registry.
2. Clone or fetch each upstream repository into a cache outside the skills
   checkout.
3. Check out the exact pinned commit.
4. Validate that the configured source contains a usable `SKILL.md`.
5. Copy the selected skill and any required shared references into
   `~/.agents/skills/<name>`.
6. Record local provenance beside the generated copy without changing the
   upstream `SKILL.md`.
7. Refuse to overwrite an existing directory unless it was previously generated
   from the same registry entry or the user explicitly approves replacement.

Generated external skill directories will be ignored by the standalone
repository. Running the installer should leave both the standalone repository
and the Dotfiles parent repository clean.

The source cache should default to an OS-appropriate user cache location.
Generated skills can be recreated from the pinned registry after cache cleanup
or `git clean` removes them.

### Updates

Do not automatically advance external skills to newer upstream commits.

The update workflow should:

1. Fetch the configured upstream branch or tag.
2. Show commits and a diff from the pinned commit to the candidate commit.
3. Require explicit approval.
4. Update the registry pin.
5. Regenerate the local exposed copy.
6. Leave the registry change for review and commit in the standalone repository.

This keeps third-party text out of repository history while preserving the
review step in the current workflow.

## Migration phases

### 1. Inventory and ownership audit

- Classify every current skill as maintained here or externally maintained.
- Record canonical repository, author, and license information for external
  skills.
- Identify relative references, helper scripts, and shared files each external
  skill needs.
- Confirm that no generated or cached files should enter the new repository.

### 2. Create the standalone repository

- Start a clean repository rather than publishing the existing vendored
  snapshots through Git history.
- Copy maintained skills, their required assets, the updater skill, and relevant
  documentation.
- Add the source registry without upstream skill bodies.
- Add ignore rules for generated external skill directories and local caches.
- Add public installation, attribution, and contribution documentation.
- Choose the repository name and license.

### 3. Replace the updater internals

- Remove assumptions that the script runs from the Dotfiles repository.
- Remove Git subtree operations and Dotfiles-specific staging paths.
- Add pinned source caching and local materialization.
- Preserve review-before-update behavior.
- Make install and sync operations idempotent.
- Split the current 1,087-line script into smaller commands or helpers where
  that improves testability.
- Add checks for path traversal, destination collisions, dirty generated copies,
  missing licenses, and malformed manifests.

This phase should be implemented and reviewed separately from the mechanical
repository extraction.

### 4. Publish the first release

- Validate direct installation into a temporary `~/.agents` equivalent.
- Validate discovery with the supported harnesses available locally.
- Publish the standalone repository.
- Tag the first stable migration checkpoint as `v0.1.0`.

Use patch releases for fixes, minor releases for new skills or meaningful
workflow changes, and reserve `v1.0.0` for a stable repository and updater
interface.

### 5. Connect Dotfiles

- Remove the old tracked `agents/.agents` tree from Dotfiles.
- Add the standalone repository as a submodule at `agents/.agents`.
- Pin it to the reviewed `v0.1.0` commit.
- Update Dotfiles installation instructions to initialize submodules.
- Add or update a setup command that initializes the submodule, stows `agents`,
  and materializes the pinned external skills.
- Keep `pi/.pi/agent/settings.base.json` pointed at `~/.agents/skills`.
- Update `README.md`, `agents/README.md`, `pi/README.md`, and
  `pi/docs/reference.md` where their installation or ownership descriptions
  change.

### 6. Validate the integrated setup

From a clean test location, verify:

- `git clone --recurse-submodules` obtains the pinned standalone repository.
- `stow agents` exposes `~/.agents/skills` through the expected symlink
  structure.
- The setup command installs pinned external skills without committing their
  contents.
- Re-running setup makes no changes.
- Both repositories report clean Git status after setup.
- Pi discovers the skills after `/reload`.
- Direct cloning of the standalone repository works without Dotfiles.
- Updating a standalone release and then the Dotfiles submodule pointer is
  documented and repeatable.

## Rejected alternatives

### Pi package as the primary installation

A Pi Git package would be easy for Pi users, but it would not preserve the
shared `~/.agents/skills` installation expected by other harnesses. It can be
offered later as an additional installation method.

### Git subtree for the standalone repository

A subtree would avoid submodule initialization, but it would duplicate the
standalone repository in Dotfiles and make the canonical source less clear. It
also reintroduces the maintenance problem this migration is intended to solve.

### Automatically following the latest branch

Following `main` would reduce update steps but allow unreviewed instructions to
arrive during an ordinary Dotfiles update. Pinning commits keeps setup
reproducible and limits that attack surface.

### Nested submodules for external skills

Nested submodules would expose upstream repositories without copying them, but
they would complicate installation and would not solve skills that depend on
files outside their own directory. A pinned local cache plus generated exposed
copy is more predictable.

## Acceptance criteria

- Dotfiles contains one submodule at `agents/.agents` and no vendored standalone
  skill files.
- The standalone repository commits only maintained skills and attribution
  metadata for external skills.
- No third-party skill body appears in the standalone repository's published
  history.
- Fresh Dotfiles setup creates the physical `~/.agents/skills` discovery path.
- External skills install from exact reviewed commits and can be regenerated
  locally.
- Updating an external pin requires an explicit review step.
- Setup and synchronization are idempotent and leave Git status clean.
- The first published release is tagged and the Dotfiles submodule points to its
  commit.

## Resolved decisions

- Repository: [`jd-santos/Skills`](https://github.com/jd-santos/Skills)
- License: GPL-3.0 for maintained skills and updater code
- External installation: all registered skills install by default
- Dotfiles setup command: `./scripts/setup-agent-skills`
- Generated provenance: one file beside each generated skill plus an ignored
  local state file for content hashes
