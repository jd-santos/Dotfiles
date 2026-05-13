---
name: tracked-skills
description: Reviews and updates third-party agent skills tracked in `.agents/tracking/`, then syncs exposed copies into `.agents/skills/`. Use when importing an upstream skill, checking for upstream changes, or when the user asks to sync, update, or review a tracked skill.
version: 1.0.0
author: jdwork
category: workflow
---

# Skill: Tracked Skills

## Description

Manages the two-layer tracked skill workflow used by this agents package. Use it to review upstream changes in `.agents/tracking/`, approve subtree pulls, sync the exposed copy into `.agents/skills/`, and keep `tracked-skills.json` up to date.

## Instructions

### 1. Pre-flight checks

Before syncing:

1. Read `../../tracked-skills.json` to find the tracked repo names, source paths, and last synced commits.
2. Read `../../docs/tracked-skills.md` if you need the full workflow.
3. Inspect the upstream snapshot in `../../tracking/<repo>/` before copying anything into `../../skills/`.
4. Confirm the source directory contains a `SKILL.md` file.

### 2. Review and update workflow

Run the main script from this skill directory:

```bash
bash scripts/tracked-skills.sh
```

That script reads `../../tracked-skills.json`, fetches all tracked upstream repos, shows commit history and diff stats, offers a full patch view, and asks before pulling each subtree update. After approval, it syncs the exposed skills and updates the manifest.

If you only need to refresh exposed skills from already-updated tracked snapshots, run:

```bash
bash scripts/tracked-skills.sh sync all
```

The sync flow copies one upstream skill directory from `tracking/` into `skills/`. If the upstream skill points at shared docs outside its own folder, the script localizes those paths into the exposed skill directory.

### 3. After syncing

1. Review the copied skill in `../../skills/<skill-name>/`.
2. Confirm that `../../tracked-skills.json` reflects the latest upstream commit and sync date.
3. Restow with `stow -R agents` if you want the installed `~/.agents/` tree updated right away.

### 4. Error handling

- If the tracking repo directory is missing, stop and ask whether the upstream repo still needs to be imported.
- If the source path does not contain `SKILL.md`, stop and confirm the correct upstream skill path.
- If local edits exist in the exposed skill, warn before overwriting them.

## References

- Workflow doc: `../../docs/tracked-skills.md`
- Manifest: `../../tracked-skills.json`
- Main script: `scripts/tracked-skills.sh`
