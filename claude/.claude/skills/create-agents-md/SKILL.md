---
name: create-agents-md
description: Creates AGENTS.md files that provide context for AI agents working in codebases. Use when setting up a new project for AI assistance, documenting conventions for agents, or when user says "create an AGENTS.md" or "set up agent context".
version: 1.0.0
author: jdwork
category: documentation
---

# Skill: Create AGENTS.md

## Description

Creates AGENTS.md files—the authoritative instruction file for AI agents working in a codebase. This file is added to the agent's context automatically, providing 100% reliable passive context without requiring tool calls or retrieval decisions.

## When to Use

- Setting up a new project for AI-assisted development
- Onboarding AI agents to an existing codebase
- Documenting project conventions that agents should follow
- Creating a compressed index for large documentation sets

**Important:** AGENTS.md is for *knowledge* (conventions, structure, rules). For *actions* (deploy, test, migrate), create a Skill instead using the `create-claude-skill` skill.

## Instructions

### 1. Pre-flight Analysis

Before generating, examine the project:

- **Structure:** Run `ls -la` and check directory organization
- **Tech stack:** Check `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, etc.
- **Existing docs:** Read `README.md` for project context
- **Conventions:** Look at existing code for style patterns
- **CI/CD:** Check `.github/workflows/`, `Makefile`, etc. for build commands

### 2. Structure the File

Use this template structure:

```markdown
# AGENTS.md

> This file provides context for AI agents working in this codebase.
> IMPORTANT: Prefer retrieval-led reasoning. Read local doc files before answering framework-specific questions.

## Project Context
- **Project**: [Name and brief purpose]
- **Tech Stack**: [Key technologies]
- **Architecture**: [Monolith/Microservices/Monorepo/etc.]

## Critical Rules
- [Rule 1: Focus on "don'ts" and constraints]
- [Rule 2: Project-specific conventions]
- [Rule 3: Common mistakes to avoid]

## Commands
- **Build**: `[command]`
- **Test**: `[command]`
- **Lint**: `[command]`

## Documentation Index
> Read files from this index when relevant to your task.
[Root]: ./.docs/
[category]: {file1.md, file2.md}

## File-Specific Notes
- **[pattern]**: [convention or note]
```

### 3. Write Critical Rules

Focus on constraints and gotchas:

- What NOT to do (more useful than obvious "do's")
- Project-specific conventions that differ from defaults
- Common mistakes agents make in this codebase
- Security considerations (what not to commit, etc.)

Example rules:
```markdown
## Critical Rules
- Never use `any` type in TypeScript—use `unknown` and narrow
- Always use `server-only` import for server utilities
- Run `pnpm check` before committing—it runs lint + typecheck + test
- Don't modify files in `generated/`—they're auto-generated
```

### 4. Add Compressed Documentation Index (if applicable)

For projects with extensive documentation (frameworks, large codebases):

1. Store docs in a `.docs/` folder (or reference existing docs location)
2. Create a compressed index mapping categories to files
3. Add the retrieval instruction

Format:
```markdown
## Documentation Index
> Agents: Read the file at the path below if related to your task.

[Root]: ./.docs/
01-getting-started: {installation.md, project-structure.md}
02-api: {endpoints.md, authentication.md, error-handling.md}
03-database: {schema.md, migrations.md, queries.md}
```

### 5. Interoperability

Recommend symlinking to support multiple tools:

```bash
# Create symlinks for other AI tools
ln -s AGENTS.md CLAUDE.md
```

Note: Only recommend symlinks the user has tools for. Common conventions:
- `CLAUDE.md` - Claude Code
- `.cursorrules` - Cursor
- `COPILOT.md` - GitHub Copilot

## Anti-Patterns

- **DON'T** dump entire documentation files—link to them instead
- **DON'T** state obvious rules ("write clean code")
- **DON'T** duplicate README content verbatim
- **DON'T** include frequently-changing information (versions, etc.)
- **DON'T** add action workflows—those belong in Skills

## Examples

### Minimal AGENTS.md (small project)

```markdown
# AGENTS.md

## Project Context
- **Project**: Personal blog built with Astro
- **Stack**: Astro, TypeScript, Tailwind CSS, MDX

## Rules
- Content lives in `src/content/`—follow the existing frontmatter schema
- Don't modify `src/components/ui/`—they're from shadcn

## Commands
- **Dev**: `pnpm dev`
- **Build**: `pnpm build`
```

### With Documentation Index (framework project)

```markdown
# AGENTS.md

> IMPORTANT: Read local doc files before answering framework questions.

## Project Context
- **Project**: E-commerce platform
- **Stack**: Next.js 15, TypeScript, Prisma, PostgreSQL
- **Architecture**: Monorepo with apps/ and packages/

## Documentation Index
[Root]: ./docs/
architecture: {overview.md, data-flow.md}
api: {rest-endpoints.md, graphql-schema.md}
database: {schema.md, migrations.md}

## Critical Rules
- Use Server Actions for mutations, not API routes
- All database queries go through `packages/db`
- Never import from `apps/` into `packages/`
```

## Cross-Reference

For repeatable workflows and actions, create a Skill instead using the `create-claude-skill` skill. Skills are better for:
- Deployment procedures
- Database migrations
- Test suite execution
- Code generation workflows
