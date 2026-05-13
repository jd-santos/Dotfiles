# Tracked Skills

This repo keeps third-party skills in two places:

- `.agents/tracking/` holds the upstream repo snapshot
- `.agents/skills/` holds the exposed skill that agents actually discover

That split keeps skill discovery clean without losing upstream context.

## Layout

In this repo:

```text
agents/.agents/
├── TRACKED-SKILLS.md
├── docs/
│   └── tracked-skills.md
├── tracking/
│   └── <upstream-repo>/
└── skills/
    ├── <exposed-skill>/
    └── tracked-skills/
        ├── SKILL.md
        └── scripts/
            └── sync-tracked-skill.sh
```

Once stowed, the installed layout is:

```text
~/.agents/
├── TRACKED-SKILLS.md
├── docs/
├── tracking/
└── skills/
```

## Why this exists

Tracking and exposed skills solve different problems.

- `tracking/` preserves where a skill came from and gives you a place to review upstream changes.
- `skills/` stays clean, predictable, and easy for agent harnesses to scan.
- The sync script copies one skill directory from `tracking/` into `skills/`.
- If the upstream skill stores shared docs outside the skill directory, the script copies those into the exposed skill and rewrites the paths to stay local.

## Sync script

Use the bundled script from the repo root:

```bash
bash agents/.agents/skills/tracked-skills/scripts/sync-tracked-skill.sh <tracking-repo> <source-path> [skill-name]
```

Or from the installed location:

```bash
bash ~/.agents/skills/tracked-skills/scripts/sync-tracked-skill.sh <tracking-repo> <source-path> [skill-name]
```

Arguments:

1. `tracking-repo`: directory name under `.agents/tracking/`
2. `source-path`: path to the upstream skill directory inside that tracked repo
3. `skill-name`: optional destination directory name under `.agents/skills/`

If `skill-name` is omitted, the script uses the basename of `source-path`.

### Example

```bash
bash agents/.agents/skills/tracked-skills/scripts/sync-tracked-skill.sh \
  informed-patient \
  informed-patient/skills/informed-patient
```

That copies the upstream skill into the exposed skills directory. If the upstream `SKILL.md` points at shared directories like `../../references/`, the script also copies those into the exposed skill and rewrites the links.

That copies:

```text
agents/.agents/tracking/informed-patient/informed-patient/skills/informed-patient
```

into:

```text
agents/.agents/skills/informed-patient
```

## Update workflow

1. Refresh the upstream snapshot in `.agents/tracking/<repo>/`
2. Review the upstream changes there
3. Run `sync-tracked-skill.sh`
4. Update `.agents/TRACKED-SKILLS.md`
5. Restow with `stow -R agents`

## Subtrees

The preferred long-term shape for `tracking/` is a git subtree per upstream repo. The sync script does not depend on subtree metadata, so it also works with a plain snapshot during setup.

If you want true subtree history, add or pull the upstream repo into `agents/.agents/tracking/<repo>/` with your normal `git subtree` workflow, then run the sync script again.

## Current tracked skill

See `../TRACKED-SKILLS.md` for the active registry. The first tracked skill is `informed-patient`, sourced from `DrCatHicks/informed-patient`.
