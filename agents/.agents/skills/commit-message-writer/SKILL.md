---
name: commit-message-writer
description: 'Writes git commit messages using Scoped Commits format (scope: description). Use when committing changes, writing commit messages, or when user says "commit this" or "write a commit message".'
version: 1.0.0
author: jdwork
category: git
---

# Skill: Commit Message Writer

## Description

Writes commit messages that put the changed area first. Use Scoped Commits format: `scope: description`. No type-first prefixes like `feat:`, `fix:`, or `chore:` unless a project explicitly asks for them.

## Instructions

### 1. Choose the scope

The scope is the subsystem, area, module, package, directory, or tool the commit touches.

Good scopes are specific enough to help someone scan `git log`:

- `auth`
- `api`
- `ui`
- `readme`
- `nvim`
- `tmux`
- `net/http`
- `net/http/cookiejar`

Use the project vocabulary. If the project already has component names, package names, app names, or top-level directories, prefer those.

**Format:** `scope: description`

**Examples:**

- `auth: add password reset flow`
- `api: handle null user in profile endpoint`
- `readme: document tmux copy mode`
- `nvim/keymaps: add diagnostics shortcut`
- `treewide: rename default branch references`

### 2. Write the description

Keep it short and direct:

- Start with lowercase unless the first word is a proper noun
- Use imperative mood, like `add`, not `added` or `adds`
- Skip the period at the end
- Aim for 50 characters, stay under 72
- Focus on what changed and why, not the implementation steps

**Be specific:**

- ❌ `api: fix bug`
- ❌ `ui: improvements`
- ✅ `api: reject empty search queries`
- ✅ `ui: prevent double-submit on checkout`

### 3. Use multiple scopes only when needed

If a commit spans more than one area, prefer one of these options:

1. Use a broader scope that covers the change.
2. Use comma-separated scopes if both are important.
3. Use `treewide`, `all`, or `global` for repo-wide changes.
4. If no useful scope exists, skip the scope rule and write a clear special commit.

Examples:

- `settings: sync theme names across UI and docs`
- `api,ui: show validation errors from server`
- `treewide: format Lua configs`

### 4. Add a body when it helps

Only add a body if the subject line needs more context:

```text
auth: prevent duplicate token refreshes

Concurrent requests were refreshing the token independently, which
caused later requests to overwrite newer credentials. Track the active
refresh promise and reuse it until it settles.
```

Add a body when:

- The change is not obvious from the description
- You need to explain why the change was made
- Multiple related changes belong in one commit
- There is migration, rollout, or compatibility context

Skip the body when the subject says enough.

### 5. Handle breaking changes and trailers

Scoped Commits does not require a special subject marker for breaking changes. Put the breaking-change note in the body or trailer:

```text
api: change auth token response

BREAKING CHANGE: auth tokens now return under `access_token` instead of `token`.
```

Ticket IDs can go after the scope or in a trailer, depending on the project:

```text
auth (PROJ-123): fix login redirect
```

```text
auth: fix login redirect

Ticket: PROJ-123
```

### 6. Special commits

Reverts, merges, release commits, and generated commits can use their normal project format. If a scoped subject is still clear, use it:

```text
auth: revert token refresh retry limit
```

Otherwise, keep Git's default wording or the release tool's generated message.

### 7. Avoid common mistakes

Do not use type-first prefixes unless the repo asks for them:

- ❌ `feat(auth): add password reset flow`
- ✅ `auth: add password reset flow`
- ❌ `fix: handle null user in profile page`
- ✅ `profile: handle null user`

Do not use vague descriptions:

- ❌ `ui: update code`
- ❌ `api: fix issues`
- ❌ `treewide: cleanup`
- ❌ `wip: stuff`

Do not write marketing copy:

- ❌ `api: implement robust validation solution`
- ✅ `api: validate email before sending invite`
- ❌ `search: add comprehensive filtering improvements`
- ✅ `search: filter archived projects`

Do not explain the code mechanics in the subject:

- ❌ `profile: change if statement to check null user`
- ✅ `profile: handle null user`

## Examples

**Rambling description:**

```text
Added a new feature where users can now reset their passwords by clicking the forgot password link
```

→ `auth: add password reset flow`

**Vague:**

```text
Fixed the bug where the thing wasn't working
```

→ `search: prevent crash on empty results`

**Too implementation-focused:**

```text
Updated the database configuration file to use a connection pool instead of creating a new connection each time
```

→

```text
db: use connection pooling

Creating a new connection per query was causing 2s delays.
Connection pooling reduces this to roughly 50ms.
```

## Notes

This format is based on [Scoped Commits](https://scopedcommits.com/), which prioritizes the changed area over a type prefix.

Split commits when changes are unrelated or review would be easier with separate history entries.
