# Tracked Skills

These skills are sourced from upstream repos, reviewed in `.agents/tracking/`, then copied into `.agents/skills/` with the tracked-skills sync script.

## Registry

| Skill              | Upstream repo                                    | Tracking path                       | Upstream skill path                        | Exposed path                      | Last synced           |
| ------------------ | ------------------------------------------------ | ----------------------------------- | ------------------------------------------ | --------------------------------- | --------------------- |
| `informed-patient` | `https://github.com/DrCatHicks/informed-patient` | `.agents/tracking/informed-patient` | `informed-patient/skills/informed-patient` | `.agents/skills/informed-patient` | 2026-05-13, `4ec9c1e` |

## Sync command

From the repo root:

```bash
bash agents/.agents/skills/tracked-skills/scripts/sync-tracked-skill.sh \
  informed-patient \
  informed-patient/skills/informed-patient
```

From the installed location:

```bash
bash ~/.agents/skills/tracked-skills/scripts/sync-tracked-skill.sh \
  informed-patient \
  informed-patient/skills/informed-patient
```

## Notes

- Review upstream changes in `.agents/tracking/` before syncing them into `.agents/skills/`.
- Restow with `stow -R agents` after syncing.
- See `.agents/docs/tracked-skills.md` for the full workflow.
