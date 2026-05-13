---
name: tracked-skills
description: Syncs third-party agent skills from `.agents/tracking/` into `.agents/skills/`. Use when importing an upstream skill, refreshing a tracked skill after upstream changes, or when the user asks to sync, update, or review a tracked skill.
version: 1.0.0
author: jdwork
category: workflow
---

# Skill: Tracked Skills

## Description

Manages the two-layer tracked skill workflow used by this agents package. Use it to review an upstream skill in `.agents/tracking/`, sync the exposed copy into `.agents/skills/`, and keep the registry up to date.

## Instructions

### 1. Pre-flight checks

Before syncing:

1. Read `../../TRACKED-SKILLS.md` to find the tracked repo name, source path, and current sync note.
2. Read `../../docs/tracked-skills.md` if you need the full workflow.
3. Inspect the upstream snapshot in `../../tracking/<repo>/` before copying anything into `../../skills/`.
4. Confirm the source directory contains a `SKILL.md` file.

### 2. Sync workflow

Run the bundled script from this skill directory:

```bash
bash scripts/sync-tracked-skill.sh <tracking-repo> <source-path> [skill-name]
```

Example:

```bash
bash scripts/sync-tracked-skill.sh informed-patient informed-patient/skills/informed-patient
```

The script copies one upstream skill directory from `tracking/` into `skills/`. If the upstream skill points at shared docs outside its own folder, the script localizes those paths into the exposed skill directory.

### 3. After syncing

1. Review the copied skill in `../../skills/<skill-name>/`.
2. Update `../../TRACKED-SKILLS.md` with the latest sync date and ref.
3. Restow with `stow -R agents` if you want the installed `~/.agents/` tree updated right away.

### 4. Error handling

- If the tracking repo directory is missing, stop and ask whether the upstream repo still needs to be imported.
- If the source path does not contain `SKILL.md`, stop and confirm the correct upstream skill path.
- If local edits exist in the exposed skill, warn before overwriting them.

## References

- Workflow doc: `../../docs/tracked-skills.md`
- Registry: `../../TRACKED-SKILLS.md`
- Sync script: `scripts/sync-tracked-skill.sh`
