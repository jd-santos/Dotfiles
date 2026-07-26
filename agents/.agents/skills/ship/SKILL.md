---
name: ship
description: >-
  Reviews the current git branch, groups ready work into commits, checks
  changelog needs, and pushes only after confirmation. Use when finishing a task,
  preparing branch changes, committing reviewed work, or when the user says
  "ship this", "commit and push", or "review this branch".
version: 1.0.0
author: jdwork
category: workflow
requires:
  - commit-message-writer
  - changelog-writer
---

# Skill: Ship

## Description

Review the current branch, turn ready work into focused commits, decide whether a
changelog update is needed, and push only after confirmation.

This skill is intentionally conservative. It should protect secrets, keep
unrelated work out of commits, and ask before doing anything uncertain.

## Prerequisites

- A git repository.
- `git` available on PATH.
- Optional: GitHub CLI (`gh`) for checking whether the repository is public.
- The `commit-message-writer` skill for commit messages.
- The `changelog-writer` skill for changelog decisions.

If companion skills are unavailable, follow their expected behavior inline:

- Commit messages use Scoped Commits: `scope: short imperative description`.
- Changelog updates follow Keep a Changelog sections and only cover notable
  user-facing, workflow, compatibility, release, or maintainer-visible changes.

## Instructions

### 1. Pre-flight Checks

Before changing anything:

1. **Load companion skills**: Read and follow `commit-message-writer` before
   writing commit messages. Read and follow `changelog-writer` before deciding
   whether to update a changelog.
2. **Confirm repository context**: Run `git rev-parse --show-toplevel` and work
   from the repository root.
3. **Inspect branch state**: Run `git status --short --branch`.
4. **Check upstream**: Determine the current branch and whether it has an
   upstream.
5. **Check public/private status when possible**: If `gh` is available and the
   repository has GitHub metadata, run `gh repo view --json isPrivate`.
6. **Protect secrets**: Never read secret-looking files. Treat these patterns as
   content-blocked: `.env*`, `*credentials*`, `*secrets*`, `*token*`, `*.key`,
   `*.pem`, private SSH keys, and cloud credential files. Use metadata only,
   such as path names and git status.

If the repo is public, warn before committing anything that may expose sensitive
data, internal URLs, personal identifiers, machine-specific private config, or
work-specific settings.

### 2. Review Workflow

1. **Build a branch picture**:
   - `git status --short --branch`
   - current branch name
   - upstream branch, if present
   - `git log --oneline --decorate @{upstream}..HEAD`, if an upstream exists
   - staged diff summary
   - unstaged diff summary
   - untracked file list
2. **Review diffs safely**:
   - Use targeted diffs for tracked, non-sensitive files.
   - Use targeted file reads only when needed to understand intent.
   - Do not read prohibited secret-looking files.
3. **Classify changes**:
   - Ready to commit
   - Probably ready, but needs user confirmation
   - Not ready, needs more work
   - Unrelated to the current task or unclear in purpose
   - Potentially sensitive
4. **Group ready work by intent**:
   - Prefer small, reviewable commits.
   - Group by logical change, not by file path alone.
   - Do not mix unrelated fixes just because they are nearby.
5. **Decide changelog needs**:
   - Update or create `CHANGELOG.md` when the ready work is notable for users,
     workflows, compatibility, releases, or maintainers.
   - Skip changelog entries for tiny refactors, formatting-only changes, or
     invisible cleanup unless they matter to users or maintainers.
   - If no changelog is needed, say why in the final summary.
6. **Commit high-confidence groups**:
   - Stage only files or hunks that belong to that group.
   - Commit with a Scoped Commit message.
   - Do not include unrelated, unclear, or sensitive changes.
7. **Ask on uncertainty**:
   - Summarize uncertain files and why they are uncertain.
   - Recommend a grouping if one is plausible.
   - Ask before staging or committing.
8. **Leave not-ready work alone**:
   - Do not commit unfinished work.
   - Explain what appears unfinished.
9. **Leave unrelated untracked work alone**:
   - Do not commit unrelated untracked files without explicit approval.
   - Mention that they may belong to another task.

### 3. Sensitive-file Guidance

Make a practical call based on repository visibility and file type.

- Public repos need stricter review for personal identifiers, internal URLs,
  machine-specific private config, and work-specific settings.
- Private repos still must not include keys, tokens, credentials, secret values,
  or `.env*` files.
- Schema-only dotenv files such as `.env.schema` and `.env-schema` are allowed
  when they contain variable names, validation rules, or resolver expressions
  without literal secret values.
- If a schema file appears to contain literal credentials, stop and ask the user
  to inspect it.
- When unsure, stop and ask. Do not read prohibited files to decide.

### 4. Push Workflow

After selected commits are created:

1. Show final status.
2. Show commits that would be pushed.
3. Ask the user to confirm pushing to the current branch's upstream.
4. If confirmed, push.
5. If no upstream exists, ask before setting one. Do not guess a remote or branch
   name.

Never push without explicit confirmation.

### 5. Error Handling

- **Not in a git repo**: Stop and say the skill needs a git repository.
- **No upstream**: Continue reviewing and committing if appropriate, but ask
  before setting upstream or pushing.
- **Dirty worktree after commits**: Explain what remains and why it was left
  uncommitted.
- **Git command fails**: Stop, show the failing command and error, and ask before
  retrying or changing strategy.
- **Potential secret detected**: Stop handling that file's contents. Report the
  path and ask the user how to proceed.
- **Changelog conflict or ambiguity**: Ask before editing the changelog.

## Examples

### Ship ready work

**User:** "Use the ship skill to review and commit this branch."

**Workflow:**

1. Inspect branch state and upstream.
2. Review staged, unstaged, and untracked changes without reading secret-looking
   files.
3. Group ready changes into focused commits.
4. Update `CHANGELOG.md` only if the change is notable.
5. Ask about uncertain work.
6. Ask before pushing.

### Ship with extra instructions

**User:** "Ship this, but leave the scratch config uncommitted."

**Workflow:**

1. Treat the scratch config as out of scope.
2. Review and commit only ready in-scope work.
3. Mention the skipped scratch config in the final summary.
