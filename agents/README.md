# Skills

The `agents` Stow package installs the standalone
[jd-santos/Skills](https://github.com/jd-santos/Skills) repository at
`~/.agents`.

The repository is pinned here as a Git submodule at `agents/.agents`. Its
maintained skills work with Pi, Claude Code, OpenCode, and other tools that
support the [Agent Skills](https://agentskills.io) format.

## Install

From the Dotfiles root, run:

```bash
./scripts/setup-agent-skills
```

The setup script:

1. Initializes the pinned `agents/.agents` submodule.
2. Installs reviewed external skills from exact commits.
3. Restows the `agents` package.
4. Verifies the generated skill contents.

The resulting discovery path is:

```text
~/.agents/skills/
```

Pi reads that path through `pi/.pi/agent/settings.base.json`. Claude Code and
OpenCode can use the same Agent Skills-compatible location.

## Clone Dotfiles manually

Initialize submodules when cloning:

```bash
git clone --recurse-submodules https://github.com/jd-santos/Dotfiles.git
```

For an existing checkout:

```bash
git submodule update --init --recursive
```

Then run `./scripts/setup-agent-skills`.

## Update maintained skills

Dotfiles pins a specific Skills commit. To move to a newer reviewed release:

```bash
cd agents/.agents
git fetch --tags origin
git checkout <version>
cd ../..
git add agents/.agents
```

Commit the new submodule pointer in Dotfiles after reviewing the release.

## External skills

External skill text is not committed to either this Dotfiles repository or the
Skills repository. The Skills installer downloads it from canonical upstream
repositories at commits pinned in `agents/.agents/tracked-skills.json`.

List, install, verify, or review updates with:

```bash
agents/.agents/scripts/tracked-skills list
agents/.agents/scripts/tracked-skills install
agents/.agents/scripts/tracked-skills verify
agents/.agents/scripts/tracked-skills update
```

The standalone repository README credits each external project and author. Its
[`tracked-skills` documentation](https://github.com/jd-santos/Skills/blob/main/docs/tracked-skills.md)
explains caching, overwrite protection, updates, and recovery.

## Edit maintained skills

Make maintained-skill changes in a separate clone of the Skills repository,
publish them there, then update this submodule pointer. Do not edit generated
external skill directories directly.
