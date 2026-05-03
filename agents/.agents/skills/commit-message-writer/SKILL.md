---
name: commit-message-writer
description: Writes git commit messages using Conventional Commits format (feat, fix, docs, refactor). Use when committing changes, writing commit messages, or when user says "commit this" or "write a commit message".
version: 1.0.0
author: jdwork
category: git
---

# Skill: Commit Message Writer

## Description

Writes commit messages that are clear, concise, and follow Conventional Commits basics. No corporate speak, no marketing language—just what changed and why in plain English.

## Instructions

### 1. Choose the Right Type

Use these prefixes for the commit type:

- **feat:** new feature or capability
- **fix:** bug fix
- **docs:** documentation changes
- **refactor:** code restructuring (no behavior change)
- **test:** adding or updating tests
- **chore:** maintenance tasks (deps, config, tooling)
- **style:** formatting, whitespace (not CSS)
- **perf:** performance improvements

**Format:** `type(optional-scope): description`

**Examples:**
- `feat(auth): add password reset flow`
- `fix: handle null user in profile page`
- `docs: update API examples`
- `chore(deps): bump react to 18.2`

### 2. Write the Description

**Keep it short and direct:**
- Start with lowercase (unless proper noun)
- Use imperative mood ("add", not "added" or "adds")
- Skip the period at the end
- ~50 chars max (definitely under 72)

**Focus on WHAT and WHY, not HOW:**
- ❌ "Updated the authentication service to check for null values before processing"
- ✅ "fix: handle null user in auth check"

**Be specific:**
- ❌ "fix: bug fix"
- ❌ "feat: improvements"
- ✅ "fix: prevent crash when user logs out twice"
- ✅ "feat: add dark mode toggle to settings"

### 3. Add a Body (Optional)

Only add a body if the commit needs more context:

```
fix: prevent race condition in data sync

The sync timer was resetting before the previous sync finished,
causing duplicate entries. Now we check if a sync is in progress.
```

**When to add a body:**
- The change isn't obvious from the description
- You need to explain WHY you did it this way
- Multiple related changes in one commit
- Breaking changes that need explanation

**When to skip the body:**
- The description says it all
- Self-explanatory refactoring
- Obvious bug fixes

### 4. Avoid Common Mistakes

**Don't use vague descriptions:**
- ❌ "update code"
- ❌ "fix issues"
- ❌ "refactor components"
- ❌ "WIP" (commit when done, not in progress)

**Don't write marketing copy:**
- ❌ "feat: implement robust error handling solution"
- ✅ "feat: add error logging to API calls"
- ❌ "fix: comprehensive improvements to validation"
- ✅ "fix: validate email before sending"

**Don't be overly formal:**
- ❌ "This commit ensures that the validation logic properly handles edge cases"
- ✅ "fix: validate empty input in search form"

**Don't explain the code:**
- ❌ "fix: changed if statement to check for null and undefined values"
- ✅ "fix: handle null user in profile"

### 5. Scope Usage (Optional)

Add a scope when working in multi-module projects:

```
feat(api): add user search endpoint
fix(ui): prevent button double-click
docs(readme): add setup instructions
chore(ci): update build workflow
```

**Skip the scope if:**
- Project is small or single-purpose
- Change affects multiple areas
- Scope doesn't add clarity

### 6. Breaking Changes

For breaking changes, add `!` after the type:

```
feat!: change API response format to JSON

Old XML format is no longer supported.
```

Or use a footer:

```
feat: update auth API

BREAKING CHANGE: auth tokens now expire after 24 hours
```

**Only mark as breaking if:**
- API changes affect consumers
- Config format changes
- CLI arguments change
- Database migrations required

## Examples

**Rambling description:**
```
Added a new feature where users can now reset their passwords by clicking the forgot password link...
```
→ `feat(auth): add password reset flow`

**Vague:**
```
Fixed the bug where the thing wasn't working
```
→ `fix: prevent crash on empty search results`

**All-in-one sentence:**
```
Updated the database configuration file to use a connection pool instead of creating a new connection each time because it was causing performance issues and now it should be faster
```
→ 
```
perf(db): use connection pooling

Creating a new connection per query was causing 2s delays.
Connection pool reduces this to ~50ms.
```

## Notes

**When to split commits:**
- Multiple unrelated changes
- Would make review easier

**When to add a body:**
- Change needs more context than the description provides
- Explaining WHY you did it this way
