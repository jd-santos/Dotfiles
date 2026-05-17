---
name: project-issue-note
description: Creates and updates Markdown project, issue, or feature notes with YAML frontmatter for repo-local tracking. Use when creating project notes, issue notes, feature notes, project tracker notes, tracking project status in Markdown, or when user says "project note", "issue note", "feature note", "project tracker note", "create an issue", or "create a feature". Prefer the TODO.md Manager skill when the user asks for tasks or todos without mentioning a project, issue, feature, note, or tracker.
version: 1.0.0
author: jdwork
category: workflow
---

# Skill: Project, Issue, or Feature Note

## Description

Creates and maintains Markdown project, issue, or feature notes that work as repo-local tracker notes. Each note has YAML frontmatter for queryable metadata plus a short Markdown body for context, next actions, decisions, and progress notes.

Use this skill when the user wants a project note, issue note, feature note, project tracker note, or YAML/Markdown project-status record. Also use it when the user asks to "create an issue" or "create a feature" and the repo uses Markdown notes instead of, or alongside, a hosted issue tracker. If the user only asks for a task list, todo list, or simple next-action tracking, prefer the TODO.md Manager skill.

## Instructions

### 1. Pre-flight Checks

Before creating or editing a project, issue, or feature note:

1. **Find repo conventions**: Check `AGENTS.md`, `README.md`, `docs/`, or existing project, issue, or feature notes for naming and location patterns.
2. **Confirm the target location**: Use the repo convention if it exists. Otherwise default to `docs/projects/` for project notes, `docs/issues/` for issue notes, and `docs/features/` for feature notes.
3. **Confirm the note title**: Use the user's title or ask for one if it is missing.
4. **Check for an existing note**: Search the target location for a matching title or slug before creating a duplicate.
5. **Protect private data**: Do not include secrets, internal URLs, access tokens, private identifiers, or work-specific details in public repos.

### 2. File Naming

Use a stable, readable filename:

```text
docs/projects/<slug>.md
docs/issues/<slug>.md
docs/features/<slug>.md
```

Slug rules:

- Lowercase words
- Hyphen-separated
- No dates unless the repo already uses dated notes
- Keep the slug stable even if the note title changes later

Examples:

- `docs/projects/add-search-index.md`
- `docs/projects/rework-onboarding-flow.md`
- `docs/issues/fix-login-timeout.md`
- `docs/features/offline-mode.md`
- `Projects/add-search-index.md` if the repo already uses `Projects/`

### 3. Frontmatter Schema

Use this canonical field order:

```yaml
status: Planned
priority: p3
type: project
summary: ""
area: ""
tags:
  - project
due: ""
ai-model: ""
ai-harness: ""
next_actions: []
blocking: ""
created: 2026-05-16
updated: 2026-05-16
topics: []
```

#### Core fields

| Field          | Required | Notes                                                                                                            |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `status`       | Yes      | One of the status values below.                                                                                  |
| `priority`     | Yes      | `p1` through `p4`.                                                                                               |
| `type`         | Yes      | One of `project`, `issue`, or `feature`.                                                                         |
| `summary`      | Yes      | One-line summary or goal. Keep as `""` when unknown so missing summaries are queryable.                          |
| `area`         | Yes      | Repo, domain, team, life area, or subsystem. Keep as `""` when unknown.                                          |
| `tags`         | Yes      | Include the matching type tag: `project`, `issue`, or `feature`, unless repo conventions specify different tags. |
| `due`          | Yes      | `YYYY-MM-DD` when set. Keep as `""` when unset.                                                                  |
| `ai-model`     | Yes      | Specific model used, such as `openrouter/anthropic/claude-haiku-4.5`. Keep as `""` when unset.                   |
| `ai-harness`   | Yes      | Tool or runtime used, such as `pi`, `Claude Code`, `OpenCode`, or `Codex CLI`. Keep as `""` when unset.          |
| `next_actions` | Yes      | YAML list of concrete next steps. Keep as `[]` when empty.                                                       |
| `blocking`     | Yes      | What this project, issue, or feature is blocking. Keep as `""` when empty.                                       |
| `created`      | Yes      | `YYYY-MM-DD` or `YYYY-MM-DD HH:MM`.                                                                              |
| `updated`      | Yes      | Same format as `created`. Update on each edit.                                                                   |
| `topics`       | Yes      | Topic list derived from `topic/*` tags. Keep as `[]` when none exist.                                            |

Keep empty fields instead of omitting them. Empty fields make missing data visible to Markdown/YAML query tools.

#### Type values

| Type      | Use when                                                                 |
| --------- | ------------------------------------------------------------------------ |
| `project` | Coordinating multi-step work with a broader outcome.                     |
| `issue`   | Tracking a bug, defect, regression, or specific problem.                 |
| `feature` | Tracking a user-facing or developer-facing capability to add or improve. |

#### Status values

Use these values unless the repo defines its own:

| Status        | Use when                                      |
| ------------- | --------------------------------------------- |
| `Backlog`     | Idea exists, but it is not planned yet.       |
| `Planned`     | Scope is known enough to queue.               |
| `In Progress` | Work has started.                             |
| `Blocked`     | Work cannot continue until something changes. |
| `Done`        | The tracked work is complete.                 |
| `Abandoned`   | The tracked work is intentionally stopped.    |

#### Priority values

| Priority | Meaning                            |
| -------- | ---------------------------------- |
| `p1`     | Urgent or blocking important work. |
| `p2`     | Important near-term work.          |
| `p3`     | Normal priority.                   |
| `p4`     | Nice-to-have or someday work.      |

#### Relationship fields

Add these only when useful:

| Field        | Notes                                                    |
| ------------ | -------------------------------------------------------- |
| `blocked_by` | Project, issue, feature, or note that must finish first. |
| `blocks`     | Project, issue, feature, or note waiting on this one.    |
| `replaces`   | Older project, issue, feature, or note this supersedes.  |
| `related`    | List of related notes, issues, PRs, or docs.             |
| `parent`     | Parent project, feature, or note in a hierarchy.         |

Relationship values can be Markdown links, repo-relative paths, issue URLs, issue IDs, or wiki-style links if the repo uses them. Match the repo's existing link style.

#### Lifecycle fields

Add these only when relevant:

| Field       | Notes                                                         |
| ----------- | ------------------------------------------------------------- |
| `started`   | Date work began. Pair with `status: In Progress` when useful. |
| `completed` | Date work completed. Pair with `status: Done`.                |
| `abandoned` | Date work stopped. Pair with `status: Abandoned`.             |
| `reviewed`  | Date the note was last reviewed without other changes.        |

### 4. Markdown Body Template

Use this body for new notes:

```markdown
# Note Title

## Summary

TBD

## Current Status

- Status: Planned
- Priority: p3
- Owner: TBD

## Next Actions

- [ ] Define the next concrete step

## Notes

## Decisions

## Links

## Log

- 2026-05-16: Created project, issue, or feature note.
```

Keep the body short. The YAML frontmatter is the tracker, and the Markdown body is for context that does not fit cleanly in fields.

### 5. Creating a Project, Issue, or Feature Note

1. **Gather required inputs**: title, type, status, priority, summary, area, due date, AI model, AI harness, and next actions.
2. **Use defaults for missing optional data**:
   - `status: Planned`
   - `priority: p3`
   - `type: project`, `type: issue`, or `type: feature`
   - `summary: ""`
   - `area: ""`
   - `due: ""`
   - `ai-model: ""`
   - `ai-harness: ""`
   - `next_actions: []`
   - `blocking: ""`
   - `topics: []`
3. **Set note type tag**: Use `project`, `issue`, or `feature` to match `type` unless the repo has its own convention.
4. **Derive topics from tags**: Convert `topic/foo/bar` tags to `foo/bar` entries in `topics`.
5. **Write the note** with canonical frontmatter order and the body template.
6. **Report the created path** and list any fields left intentionally empty.

### 6. Updating a Project, Issue, or Feature Note

When editing an existing note:

1. Preserve canonical field order for known fields.
2. Preserve unknown fields unless they contain sensitive data or the user asks to remove them.
3. Update `updated` to the current date or datetime.
4. Keep `topics` in sync with `topic/*` tags.
5. Mirror `next_actions` between frontmatter and body when practical:
   - Frontmatter `next_actions` should hold short, queryable action strings.
   - Body `## Next Actions` can use Markdown checkboxes with more detail.
6. Add a dated entry to `## Log` for meaningful status, scope, or priority changes.

### 7. Error Handling

If information is missing:

- Use the defaults above for non-critical fields.
- Ask before guessing the title, status, priority, or target location when those are ambiguous.

If a note already exists:

- Do not create a duplicate.
- Ask whether to update the existing note or create a differently named one.

If the repo has conflicting conventions:

- Follow the local convention for path, tags, date format, and link style.
- Keep the canonical field order unless the repo clearly uses a different order.

If the repo is public:

- Warn before writing sensitive or personal metadata.
- Suggest generic labels, environment variables, private overlays, or local-only notes instead.

## Examples

### Basic Project Note

**User:** "Create a project note for adding search index support."

**Result:** Create `docs/projects/add-search-index-support.md` with frontmatter like:

```yaml
status: Planned
priority: p3
type: project
summary: "Add search indexing so documentation pages can be queried locally."
area: Development
tags:
  - project
  - topic/search
due: ""
ai-model: ""
ai-harness: pi
next_actions:
  - Compare indexing libraries
  - Choose storage format
blocking: ""
created: 2026-05-16
updated: 2026-05-16
topics:
  - search
```

### Basic Issue Note

**User:** "Create an issue for fixing login timeouts."

**Result:** Create `docs/issues/fix-login-timeouts.md` with frontmatter like:

```yaml
status: Planned
priority: p2
type: issue
summary: "Fix login requests timing out under slow network conditions."
area: Auth
tags:
  - issue
  - topic/auth
due: ""
ai-model: ""
ai-harness: pi
next_actions:
  - Reproduce timeout locally
  - Check auth request retry behavior
blocking: ""
created: 2026-05-16
updated: 2026-05-16
topics:
  - auth
```

### Basic Feature Note

**User:** "Create a feature note for offline mode."

**Result:** Create `docs/features/offline-mode.md` with frontmatter like:

```yaml
status: Backlog
priority: p3
type: feature
summary: "Add offline mode so users can keep working without network access."
area: App
tags:
  - feature
  - topic/offline
due: ""
ai-model: ""
ai-harness: pi
next_actions:
  - Define offline data requirements
  - Identify sync conflict cases
blocking: ""
created: 2026-05-16
updated: 2026-05-16
topics:
  - offline
```

### Updating Status

**User:** "Mark the search index project blocked by the schema decision."

**Action:** Update frontmatter:

```yaml
status: Blocked
blocked_by: docs/decisions/search-schema.md
updated: 2026-05-16
```

Then add a log entry:

```markdown
- 2026-05-16: Marked blocked by the search schema decision.
```

## Notes

- Do not reference external sync scripts, task services, or plugins unless the repo already uses them and the user asks for that integration.
- Prefer repo-relative paths over personal vault paths.
- Prefer plain strings for `ai-model` and `ai-harness` so YAML query tools can group them consistently.
- Keep field names stable. If a repo previously used `objective`, migrate to `summary` only when the user approves.
- Keep field names stable. If a repo previously used `ai-assistant`, migrate to `ai-model` and `ai-harness` only when the user approves.
