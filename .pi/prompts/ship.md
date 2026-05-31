---
description: Review the current branch, commit ready work, and push after confirmation
argument-hint: "[extra instructions]"
---
Run a branch shipping review for the current repository.

Extra user instructions, if any:

$ARGUMENTS

## Goals

- Review all work on the current branch, including staged changes, unstaged changes, untracked files, and commits that have not been pushed.
- Identify work that is ready to commit.
- Group ready changes into coherent commits.
- Follow my commit-message-writer skill for commit messages.
- Create commits when confidence is high that the work is ready.
- Ask before committing anything uncertain.
- Push to the current branch's upstream only after commits and confirmations are complete.

## Required setup

1. Load and follow the commit-message-writer skill before writing commit messages. If the skill is not already loaded, read `~/.agents/skills/commit-message-writer/SKILL.md`.
2. Check whether the repository is public with `gh repo view --json isPrivate` when GitHub metadata is available.
3. Never read secret-looking files. Do not read `.env*`, `*credentials*`, `*secrets*`, `*token*`, `*.key`, or `*.pem`. For these files, use metadata only, such as path names and git status.

## Review workflow

1. Inspect repository state:
   - `git status --short --branch`
   - current branch and upstream
   - `git log --oneline --decorate @{upstream}..HEAD` if an upstream exists
   - staged diff summary
   - unstaged diff summary
   - untracked file list
2. Review diffs and relevant files for non-sensitive paths. Use targeted reads, not broad dumps.
3. Classify each change group:
   - Ready to commit
   - Probably ready, but needs user confirmation
   - Not ready, needs more work
   - Unrelated to the current conversation or unclear in purpose
   - Potentially sensitive
4. Group ready changes by logical intent, not by file path alone. Prefer small reviewable commits.
5. For each high-confidence group:
   - Stage only the files or hunks that belong to that group.
   - Commit with a Conventional Commit message from the commit-message-writer skill.
   - Do not include unrelated changes just because they are nearby.
6. For uncertain groups:
   - Summarize the files and the reason for uncertainty.
   - Recommend a commit grouping if one is plausible.
   - Ask the user before staging or committing.
7. For not-ready work:
   - Leave it uncommitted.
   - Explain what seems unfinished.
8. For unrelated untracked work:
   - Do not commit it without explicit user approval.
   - Note that it may belong to a different task or conversation.

## Sensitive-file guidance

Make a practical call based on the repository and file type.

- If the repo is public, be stricter about personal identifiers, internal URLs, machine-specific private config, and anything that looks like a secret.
- If the repo is private, still never commit keys, tokens, credentials, secret values, or `.env*` files.
- `.env-schema` and similar schema-only files are allowed when they contain variable names or structure without secret values.
- When unsure, stop and ask. Do not read prohibited secret-looking files to decide.

## Push workflow

After all selected commits are created:

1. Show the final status and the commits that would be pushed.
2. Ask the user to confirm pushing to the current branch's upstream.
3. If confirmed, push.
4. If no upstream exists, ask before setting one. Do not guess a remote or branch name.

End with a concise summary of:

- commits created
- work left uncommitted
- anything the user needs to decide next
