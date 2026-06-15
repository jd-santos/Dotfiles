---
name: changelog-writer
description: Writes human-readable CHANGELOG.md entries using Keep a Changelog sections with optional date-based or SemVer releases. Use when updating changelogs, writing release notes, summarizing notable changes, preparing releases, or when user says "update the changelog", "write release notes", or "summarize these changes".
version: 1.0.0
author: jdwork
category: documentation
---

# Skill: Changelog Writer

## Description

Writes and updates `CHANGELOG.md` for humans, not machines. Use Keep a Changelog sections, default to date-based releases, and only use Semantic Versioning when the project already has a clear versioning policy or the user asks for it.

## Instructions

### 1. Pre-flight checks

Before writing:

1. **Find the repo root**: Work from the Git repository root when possible.
2. **Check the current state**: Review `git status --short`, changed file names, recent commits, and diff stats before reading detailed diffs.
3. **Check versioning signals**: Look for existing version tags, package versions, release notes, or an existing SemVer statement in `CHANGELOG.md`.
4. **Protect secrets**: Do not read prohibited secret files such as `.env*`, credentials, tokens, keys, or pem files. If changed files look sensitive, stop and ask the user how to summarize them safely.
5. **Respect public repos**: Avoid internal URLs, personal identifiers, client names, credentials, or machine-specific private details in changelog entries.

Useful read-only commands:

```bash
git status --short
git diff --stat
git diff --name-only
git log --oneline --decorate -n 30
git tag --sort=-creatordate | head
```

If the repo uses release tags, compare from the latest tag:

```bash
git describe --tags --abbrev=0
git log --oneline <latest-tag>..HEAD
git diff --stat <latest-tag>..HEAD
```

### 2. Choose the changelog mode

Use the least formal mode that fits the project.

**Default: date-based mode**

Use this when the project does not have a stable public API, package releases, or existing version tags.

```markdown
## Unreleased

## 2026-06-12
```

**SemVer mode**

Use this only when the project already follows Semantic Versioning, has version tags, publishes packages, or the user asks for versioned releases.

```markdown
## [Unreleased]

## [0.2.0] - 2026-06-12
```

**Existing format mode**

If `CHANGELOG.md` already has a format, preserve it unless the user asks to migrate.

### 3. Create `CHANGELOG.md` if needed

If the project has no changelog, create a root-level `CHANGELOG.md`.

Use this default header for date-based projects:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).
This project does not currently declare a Semantic Versioning policy.

## Unreleased
```

Use this header only for SemVer projects:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]
```

### 4. Write human-facing entries

Use these sections from Keep a Changelog:

- `Added` for new features or capabilities
- `Changed` for changes in existing behavior
- `Deprecated` for features that will be removed later
- `Removed` for removed features
- `Fixed` for bug fixes
- `Security` for vulnerability fixes or security-relevant changes

Rules:

- Write for users, contributors, and future-you.
- Do not dump raw commit logs into the changelog.
- Summarize related commits into one useful bullet.
- Mention behavior, workflows, compatibility, and migration impact.
- Skip tiny refactors, formatting-only edits, and invisible cleanup unless they matter to users or maintainers.
- Omit empty sections.
- Keep bullets plain and specific.
- Avoid secrets, internal hostnames, private names, and local machine paths.

Good entries:

```markdown
### Added

- Add a `changelog-writer` skill for date-based release notes.

### Changed

- Switch commit-message guidance from Conventional Commits to Scoped Commits.
```

Bad entries:

```markdown
### Changed

- Update files.
- Fix stuff.
- commit 6fd3a21.
```

### 5. Update `Unreleased`

For normal development work, add entries under `## Unreleased`.

When updating an existing `Unreleased` section:

1. Preserve useful existing entries.
2. Merge duplicate bullets.
3. Add missing sections only when needed.
4. Keep sections in this order: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
5. Keep newest release sections below `Unreleased`.

### 6. Cut a release when asked

Only cut a release when the user asks for release notes, a release prep, or a changelog rollup.

For date-based releases:

```markdown
## Unreleased

## 2026-06-12
```

For SemVer releases:

```markdown
## [Unreleased]

## [0.2.0] - 2026-06-12
```

Release workflow:

1. Move current `Unreleased` entries into the new release section.
2. Add a fresh empty `Unreleased` section above it.
3. Include the release date in `YYYY-MM-DD` format.
4. If the release was yanked, mark it as `[YANKED]` in the heading.
5. Add compare links for SemVer projects when the repository already uses them. Do not let missing links block the changelog.

### 7. Flag breaking and migration changes

Even without SemVer, call out anything that may break scripts, configs, saved data, or user workflows.

Look for changes to:

- CLI commands, flags, exit codes, or stdout formats
- Config keys and file formats
- Environment variable names or meanings
- Public APIs, plugin interfaces, or exported library symbols
- Database schemas, migrations, or stored data formats
- Default behavior that users may rely on

Put these in `Changed`, `Deprecated`, or `Removed`, and include a short migration note when useful.

Example:

```markdown
### Changed

- Rename the `PI_MODEL` setting to `PI_DEFAULT_MODEL`.
  Existing local configs need to update the variable name.
```

### 8. Error handling

If context is incomplete:

1. Ask the user what changed or what audience the changelog is for.
2. Draft entries with an explicit "Needs confirmation" note instead of guessing.

If changed files may contain secrets:

1. Do not read them.
2. Ask the user for a safe, non-sensitive summary.
3. Write a generic entry if needed, such as `Changed local environment setup documentation`.

If the changelog has merge conflicts or malformed Markdown:

1. Stop before editing.
2. Report the conflict or formatting issue.
3. Ask whether to repair the file first.

## Examples

### Example: Update an unreleased changelog

**User:** "Update the changelog for this work."

**Workflow:**

1. Inspect `git status --short`, `git diff --stat`, and recent commits.
2. Read `CHANGELOG.md` if present.
3. Add only notable entries under `## Unreleased`.
4. Preserve the existing date-based or SemVer style.

**Result:**

```markdown
## Unreleased

### Added

- Add a `changelog-writer` skill for human-readable release notes.

### Changed

- Document Scoped Commits as the default commit message style.
```

### Example: Start a scrappy changelog

**User:** "Create a changelog for this project."

**Result:**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).
This project does not currently declare a Semantic Versioning policy.

## Unreleased

### Added

- Start tracking notable project changes in `CHANGELOG.md`.
```

## References

- [Keep a Changelog](https://keepachangelog.com/)
- [Olivier Lacan's Keep a Changelog repository](https://github.com/olivierlacan/keep-a-changelog)
- [Semantic Versioning](https://semver.org/)
