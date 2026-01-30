---
name: create-claude-skill
description: Creates Claude Code skills for repeatable workflows and actions, with proper frontmatter metadata, searchable descriptions, pre-flight checks, error handling, and structured instructions.
version: 1.0.0
author: jdwork
category: meta
tags: [skills, authoring, templates]
---

# Skill: Create Claude Skill

## Description

Creates well-structured Claude Code skills for repeatable workflows and actions. Skills are retrieved by agents when needed, making them ideal for specific procedures rather than general knowledge.

## When to Create a Skill

**DO create a skill for:**
- Deployment procedures
- Database migrations
- Running test suites with specific setup
- Code generation workflows
- Audits (accessibility, security, performance)
- Complex refactoring procedures

**DON'T create a skill for:**
- General framework knowledge → use AGENTS.md
- Coding conventions → use AGENTS.md
- Project structure documentation → use AGENTS.md

**Rule of thumb:** If it's a repeatable *action* with specific steps → Skill. If it's *knowledge* the agent should always have → AGENTS.md (use `create-agents-md` skill).

## Instructions

### 1. Required Frontmatter

Every skill must have YAML frontmatter:

```yaml
---
name: kebab-case-skill-name
description: Verb-first sentence describing what the skill does, including searchable keywords and context for when it's useful.
version: 1.0.0
author: [optional - creator name]
category: [category from list below]
tags: [optional - array of searchable keywords]
requires: [optional - array of other skill names this depends on]
---
```

### 2. Category Options

Use one of these standard categories:

| Category | Use For |
|----------|---------|
| `automation` | CI/CD, deployments, builds, scheduled tasks |
| `code-quality` | Linting, formatting, refactoring, code review |
| `database` | Migrations, queries, schema changes, backups |
| `documentation` | Docs generation, README updates, API docs |
| `meta` | Skills about skills, templates, tooling setup |
| `security` | Audits, vulnerability scanning, secrets management |
| `testing` | Test execution, coverage, fixtures, mocking |
| `workflow` | Multi-step procedures that span categories |

### 3. Write Searchable Descriptions

Descriptions help agents find the right skill. Write them for retrieval:

**Format:** Start with a verb, include what/why/when.

```yaml
# Good - verb-first, includes context and keywords
description: Runs database migrations safely with backup verification, rollback support, and environment checks for PostgreSQL and MySQL databases.

# Bad - vague, no searchable terms
description: Helps with database stuff.
```

**Tips:**
- Start with action verb (Creates, Runs, Audits, Generates, Deploys)
- Include the target (database, API, components, tests)
- Add context (when useful, what problem it solves)
- Include technology keywords (PostgreSQL, React, Docker)

### 4. Structure the Skill Body

Required sections:

```markdown
# Skill: [Human-Readable Name]

## Description
[1-2 sentences on what this does and when to use it]

## Instructions

### 1. Pre-flight Checks
[What to verify before running]

### 2. Main Workflow
[Numbered steps to execute]

### 3. Error Handling
[What to do when things fail]

## Examples
[At least one usage example]
```

Optional sections:
- `## Prerequisites` - Required tools, setup, or context
- `## Notes` - Caveats, edge cases, tips
- `## Cross-Reference` - Related skills or AGENTS.md

### 5. Write Pre-flight Checks

Explicit checks prevent errors:

```markdown
### 1. Pre-flight Checks

Before running this skill:

1. **Verify environment**: Check that `.env` exists and has required variables
2. **Confirm target**: Ask user to confirm the target environment (dev/staging/prod)
3. **Check dependencies**: Run `which docker` to ensure Docker is installed
4. **Backup state**: If modifying data, note current state for rollback
```

### 6. Define Error Handling

Tell the agent what to do on failure:

```markdown
### 3. Error Handling

If the migration fails:
1. Read the error log at `./logs/migration-error.log`
2. Do NOT retry automatically—report the error to the user
3. If in production, immediately run the rollback script
4. Check the `migrations/` folder for the failed migration file
```

### 7. Add Examples

Show realistic usage with expected behavior:

```markdown
## Examples

### Example: Running in Development

**User:** "Use the migrate-db skill to run pending migrations"

**Workflow:**
1. Check environment → `.env` shows `DATABASE_URL` is set
2. Confirm target → User confirms "development"
3. Run migrations → `prisma migrate dev`
4. Report results → "Applied 3 migrations successfully"
```

## Skill Composition

For complex skills, split into smaller skills and use `requires`:

```yaml
---
name: full-deploy
requires: [run-tests, build-app, deploy-to-cloud]
---
```

Keep individual skills under 200 lines when possible. If a skill grows too large, extract sub-workflows into separate skills.

## Anti-Patterns

- **God skills:** One skill that does everything → Split into focused skills
- **Micro skills:** Skill for trivial single commands → Just document in AGENTS.md
- **Knowledge skills:** General "how to" information → Use AGENTS.md instead
- **Missing error handling:** No guidance on failures → Always include recovery steps

## Template

```markdown
---
name: skill-name
description: [Verb-first description with keywords]
version: 1.0.0
category: [category]
tags: [tag1, tag2]
---

# Skill: [Human Name]

## Description

[What this skill does and when to use it.]

## Instructions

### 1. Pre-flight Checks

Before running:
- [ ] Check [requirement 1]
- [ ] Verify [requirement 2]

### 2. Workflow

1. **Step one**: [action]
2. **Step two**: [action]
3. **Step three**: [action]

### 3. Error Handling

If the skill fails:
1. [Recovery action]
2. [Fallback behavior]

## Examples

### Basic Usage

**User:** "[example request]"
**Result:** [expected outcome]

## Notes

[Optional caveats or tips]
```

## Cross-Reference

For project knowledge and conventions that agents should always have, create an AGENTS.md file instead using the `create-agents-md` skill.
