# Skills

Reusable instruction sets for AI agents, managed as a GNU Stow package. Skills are loaded on-demand via the `skill` tool in OpenCode, Claude Code, or any tool that follows the [Agent Skills](https://agentskills.io) open standard.

## Discovery paths

Skills in this package land at `~/.agents/skills/`, which is picked up by:

- **Pi**: via the `skills` path in `~/.pi/agent/settings.json`
- **OpenCode**: global agent-compatible path
- **Claude Code**: via the `.agents/` compat layer
- Any tool implementing the Agent Skills standard

## Skill structure

Each skill is a directory with a single `SKILL.md`:

```
~/.agents/skills/
├── skill-name/
│   └── SKILL.md           # required; must be all caps
├── marimo-pair/
│   ├── SKILL.md
│   ├── scripts/           # bundled shell scripts
│   └── reference/         # bundled reference docs
└── ...
```

`SKILL.md` must start with YAML frontmatter:

```yaml
---
name: skill-name # required; must match directory name
description: What it does and when to use it # required; 1-1024 chars
version: 1.0.0 # optional
author: you # optional
category: workflow # optional
---
```

## Usage

Skills are loaded on-demand. In Pi, OpenCode, or Claude Code, the agent sees available skills and loads them as needed. You can also ask directly:

```
"Use the marimo skill to help me build this notebook"
```

## Adding a skill

```bash
mkdir -p agents/.agents/skills/my-skill
$EDITOR agents/.agents/skills/my-skill/SKILL.md
stow -R agents   # restow to pick up new dirs
```

## Managing

```bash
# List installed skills
ls ~/.agents/skills/

# Edit a skill
$EDITOR ~/.agents/skills/skill-name/SKILL.md

# Remove a skill
rm -rf agents/.agents/skills/skill-name/ && stow -R agents
```

## Tracked upstream skills

Third-party skills live in two layers:

| Layer    | Path                       | Purpose                                                          |
| -------- | -------------------------- | ---------------------------------------------------------------- |
| Tracking | `.agents/tracking/<repo>/` | Full upstream repo via git subtree. Used for diffing and review. |
| Exposed  | `.agents/skills/<skill>/`  | Self-contained copy agents actually discover and load.           |

This means the skill content exists in both places. That's intentional: the tracking copy preserves upstream context for review, while the exposed copy gets path rewriting (e.g., `../../references/` becomes `references/`) so it works standalone without depending on the upstream repo layout.

`tracked-skills.json` records what's tracked, where it came from, and which upstream commit was last synced.

### Commands

The main script lives at `agents/.agents/skills/tracked-skills/scripts/tracked-skills.sh`.

```bash
# Add a new upstream repo: scans for SKILL.md files, lets you pick which to track
bash agents/.agents/skills/tracked-skills/scripts/tracked-skills.sh add <repo-url> [ref]

# Review and update: fetches upstream, shows diffs, asks before pulling
bash agents/.agents/skills/tracked-skills/scripts/tracked-skills.sh

# Sync only: refresh exposed skills from current tracking/ snapshots
bash agents/.agents/skills/tracked-skills/scripts/tracked-skills.sh sync all
```

The update flow fetches each tracked upstream repo, shows the commit log and diff stat since your last sync, optionally shows the full patch, then asks before applying. After approval, it pulls the subtree, syncs the exposed skill, and updates the manifest.

### How syncing works

When syncing, the script copies the skill directory from `tracking/` into `skills/`. If the upstream skill references shared docs outside its own directory (common in monorepos), those get copied into the exposed skill and the paths get rewritten to stay local. The result is a self-contained skill directory that doesn't depend on the tracking tree at runtime.

For the full workflow details, see `agents/.agents/docs/tracked-skills.md`.

## Integration with dotfiles

```bash
stow agents    # install → ~/.agents/skills/
stow -D agents # uninstall
stow -R agents # restow after changes
```

## Available skills

### Language & Framework

- **swift-mentor**: teaches Swift/SwiftUI/SwiftData; explains patterns and trade-offs for learners
- **swift-code-writer**: generates idiomatic Swift code for experienced developers without hand-holding

### Marimo (reactive Python notebooks)

- **marimo**: hub skill; reactive model basics, routing, and references for notebook editing, interactive data, SQL, apps, exports, and deployment
- **marimo-pair**: live kernel access; discover servers, execute code, create/edit cells programmatically via `code_mode`; includes bundled `scripts/` and `reference/`

### Learning

- **learning-opportunities**: facilitates deliberate skill development during AI-assisted coding; offers interactive exercises (prediction, teach-it-back, trace the path) after architectural work
- **orient**: generates a repo-specific `orientation.md` for a codebase, used by the learning-opportunities skill for guided orientation exercises
- **planning-first**: two-round planning protocol before non-trivial work; clarifies intent first, then proposes approaches with tradeoffs
- **informed-patient**: structured symptom interview and evidence-based literature review to prepare for medical appointments; only activate on explicit request

### Development workflows

- **add-pi-feature**: adds pi coding agent features: skills, extensions, prompt templates, themes, custom tools, commands, and flags
- **create-agents-md**: creates AGENTS.md files for AI agent context in codebases
- **create-skill**: creates new SKILL.md files with proper structure and frontmatter
- **tracked-skills**: adds new tracked repos, reviews upstream tracked skills, pulls subtree updates after approval, and syncs exposed skills
- **technical-writing-style**: casual-professional tone guide; anti-AI-slop
- **commit-message-writer**: Conventional Commits format with a casual tone
- **todo-manager**: creates and manages TODO.md files
- **project-issue-note**: creates and updates Markdown project, issue, or feature notes with YAML frontmatter for repo-local tracking

### Meta

- **example-skill**: template demonstrating skill structure and format

## Resources

- [Pi docs](https://pi.dev/docs)
- [OpenCode Skills docs](https://opencode.ai/docs/skills/)
- [Agent Skills standard](https://agentskills.io)
- [GNU Stow manual](https://www.gnu.org/software/stow/manual/stow.html)
