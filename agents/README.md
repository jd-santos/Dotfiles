# Skills

Reusable instruction sets for AI agents, managed as a GNU Stow package. Skills are loaded on-demand via the `skill` tool in OpenCode, Claude Code, or any tool that follows the [Agent Skills](https://agentskills.io) open standard.

## Discovery paths

Skills in this package land at `~/.agents/skills/`, which is picked up by:

- **Pi** — via the `skills` path in `~/.pi/agent/settings.json`
- **OpenCode** — global agent-compatible path
- **Claude Code** — via the `.agents/` compat layer
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
name: skill-name          # required; must match directory name
description: What it does and when to use it  # required; 1-1024 chars
version: 1.0.0            # optional
author: you               # optional
category: workflow        # optional
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

## Integration with dotfiles

```bash
stow agents    # install → ~/.agents/skills/
stow -D agents # uninstall
stow -R agents # restow after changes
```

## Available skills

### Language & Framework

- **swift-mentor** — teaches Swift/SwiftUI/SwiftData; explains patterns and trade-offs for learners
- **swift-code-writer** — generates idiomatic Swift code for experienced developers without hand-holding

### Marimo (reactive Python notebooks)

- **marimo** — hub skill; reactive model basics, routing table to sub-skills
  - **marimo-pair** — live kernel access: discover servers, execute code, create/edit cells programmatically via `code_mode`; includes bundled `scripts/` and `reference/`
  - **marimo-notebook** — editor workflow; cell DAG, disabling cells, `mo.stop`, lazy mode, keyboard shortcuts
  - **marimo-data** — interactive data: `mo.ui` widgets, dataframe viewer, reactive filtering, SQL cells, Altair/Plotly
  - **marimo-app** — deployment: `marimo run`, `marimo export`, WASM, scripts, CLI args, scheduling

### Development workflows

- **create-agents-md** — creates AGENTS.md files for AI agent context in codebases
- **create-skill** — creates new SKILL.md files with proper structure and frontmatter
- **technical-writing-style** — casual-professional tone guide; anti-AI-slop
- **commit-message-writer** — Conventional Commits format with a casual tone
- **todo-manager** — creates and manages TODO.md files

### Meta

- **example-skill** — template demonstrating skill structure and format

## Resources

- [Pi docs](https://pi.dev/docs)
- [OpenCode Skills docs](https://opencode.ai/docs/skills/)
- [Agent Skills standard](https://agentskills.io)
- [GNU Stow manual](https://www.gnu.org/software/stow/manual/stow.html)
