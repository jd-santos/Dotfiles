# Tracked Skills

This repo keeps third-party skills in two places:

- `.agents/tracking/` holds the upstream repo snapshot
- `.agents/skills/` holds the exposed skill that agents actually discover

That split keeps skill discovery clean without losing upstream context.

## Layout

In this repo:

```text
agents/.agents/
├── docs/
│   └── tracked-skills.md
├── tracked-skills.json
├── tracking/
│   └── <upstream-repo>/
└── skills/
    ├── <exposed-skill>/
    └── tracked-skills/
        ├── SKILL.md
        └── scripts/
            ├── tracked-skills.sh
            └── sync-tracked-skill.sh
```

Once stowed, the installed layout is:

```text
~/.agents/
├── docs/
├── tracked-skills.json
├── tracking/
└── skills/
```

## Why this exists

Tracking and exposed skills solve different problems.

- `tracking/` preserves where a skill came from and gives you a place to review upstream changes.
- `skills/` stays clean, predictable, and easy for agent harnesses to scan.
- `tracked-skills.sh` is the main entry point. It can review upstream changes, pull subtree updates after confirmation, sync exposed skills, and update the manifest.
- The sync flow copies one skill directory from `tracking/` into `skills/`.
- If the upstream skill stores shared docs outside the skill directory, the script copies those into the exposed skill and rewrites the paths to stay local.

## Main script

Use the bundled script from the repo root:

```bash
bash agents/.agents/skills/tracked-skills/scripts/tracked-skills.sh
```

That command reads `.agents/tracked-skills.json`, fetches every tracked upstream repo, shows commit history and diff stats, offers a full patch view in context, then asks before applying subtree pulls. After you confirm, it syncs the exposed skills and updates the JSON manifest.

### Sync only

If you already updated `tracking/` by some other route and only want to refresh the exposed skills:

```bash
bash agents/.agents/skills/tracked-skills/scripts/tracked-skills.sh sync all
```

The older `sync-tracked-skill.sh` file still exists as a thin wrapper around the main script's `sync-one` helper.

### Example

```bash
bash agents/.agents/skills/tracked-skills/scripts/tracked-skills.sh
```

That checks every repo in `.agents/tracked-skills.json`. For each repo with upstream changes, it shows the commit log since the recorded sync point, a diff stat, and optionally the full patch. If you approve the update, it pulls the subtree, syncs the exposed skill, and records the new upstream commit in the JSON manifest.

## Update workflow

1. Run `tracked-skills.sh` from the repo root
2. Review the commit log, diff stat, and optional full patch for each tracked repo
3. Confirm the updates you want to pull
4. Let the script sync exposed skills and update `.agents/tracked-skills.json`
5. Restow with `stow -R agents`

## Subtrees

The preferred long-term shape for `tracking/` is a git subtree per upstream repo. The update workflow does not depend on extra subtree metadata beyond the tracked checkout itself, so it also works with a plain snapshot during setup.

If you manage the subtree manually, add or pull the upstream repo into `agents/.agents/tracking/<repo>/` with your normal `git subtree` workflow, then run `tracked-skills.sh sync all`.

## Manifest

Tracked skills live in `../tracked-skills.json`. Each entry records:

- `name`: human-friendly skill name
- `repo`: upstream git repo URL
- `ref`: branch or tag to track
- `tracking_repo`: directory name under `.agents/tracking/`
- `source_path`: skill directory inside the tracked repo
- `skill_name`: destination directory under `.agents/skills/`
- `last_synced_commit`: upstream commit last pulled into the subtree
- `last_synced_at`: date of the last approved sync
