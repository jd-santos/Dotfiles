---
name: todo-manager
description: Creates and manages TODO.md files with In Progress, Up Next, Backlog, and Done sections. Use when managing tasks, tracking progress, or when user mentions "todo" (add todo, update todo, create todo, mark done, etc.).
version: 1.0.0
author: jdwork
category: workflow
---

# Skill: TODO.md Manager

## Description

Manages project TODO.md files with structured sections for task tracking. Handles adding tasks, nesting sub-tasks under existing items, and summarizing completed work.

## Instructions

### 1. Locate or Create TODO.md

**Search order:**
1. `./TODO.md` (project root)
2. `./docs/TODO.md`

**If neither exists:** Create `docs/TODO.md` with this template:

```markdown
# TODO

## In Progress

## Up Next

## Backlog

## Done
```

### 2. Task Format

**Main tasks:**
```markdown
- [ ] Task description
```

**With priority (optional):**
```markdown
- [ ] [HIGH] Fix critical auth bug
- [ ] [MED] Add user settings page
- [ ] [LOW] Update footer styling
```

**Sub-tasks (indented with 2 spaces):**
```markdown
- [ ] Implement auth flow
  - [ ] Add login endpoint
  - [ ] Add logout endpoint
  - [ ] Write tests
```

### 3. Adding New Tasks

**Workflow:**

1. **Check existing items** in the target section (usually Up Next or Backlog)
2. **Look for related tasks** the new item might belong under
3. **If clearly related:** Add as indented sub-task
4. **If ambiguous:** Ask the user: "Should this go under '[existing task]' or as a new item?"
5. **If unrelated:** Add as new top-level item

**Context clues for sub-task detection:**
- New task mentions same feature/component as existing task
- New task is a step toward completing an existing task
- Keywords overlap significantly (e.g., "auth", "login", "user")

**Example:**
```
Existing: - [ ] Implement auth flow
New task: "add password reset endpoint"

→ Clearly related, add as sub-task:
- [ ] Implement auth flow
  - [ ] Add password reset endpoint
```

### 4. Proactive Suggestions

**When to suggest tasks:**

If you notice high-priority issues while working (critical bugs, missing error handling, security concerns, broken tests), you can prompt the user:

"I noticed [issue]. Should I add '[suggested task]' to the TODO list?"

**Only suggest when:**
- Issue is genuinely important (HIGH priority level)
- It's clear the user hasn't already addressed it
- You're actively working in related code

**Don't spam suggestions:**
- Limit to 1-2 per session unless user asks for more
- Skip minor improvements or style issues
- Focus on functionality, security, or blocking problems

### 5. Moving Tasks Between Sections

**In Progress → Done:**
1. Summarize the task to a single line (drop sub-task checklists)
2. Add brief parenthetical if sub-tasks provide useful context
3. Mark as checked
4. **Insert at the top of Done section** (newest first)
5. Remove from In Progress

**Example transformation:**
```markdown
# Before (In Progress):
- [ ] Implement auth flow
  - [x] Add login endpoint
  - [x] Add logout endpoint
  - [x] Add password reset
  - [x] Write tests for auth

# After (Done):
- [x] Implement auth flow (login, logout, password reset)
```

**Other moves:**
- Up Next → In Progress: Move as-is (preserve sub-tasks and their checked state)
- Backlog → Up Next: Move as-is
- Any section → Backlog: Move as-is (demoting)

### 6. Section Order

Maintain this order in the file:

1. `## In Progress` - Currently being worked on
2. `## Up Next` - Queued for immediate attention
3. `## Backlog` - Future work, not prioritized
4. `## Done` - Completed work (summaries only, newest first)

### 7. Priority Markers

Use when specified by user or when task urgency is mentioned:

| Priority | When to use |
|----------|-------------|
| `[HIGH]` | Blocking issues, critical bugs, urgent deadlines |
| `[MED]` | Important but not urgent, normal feature work |
| `[LOW]` | Nice-to-have, minor improvements, tech debt |

**Don't add priority** if the user doesn't mention urgency—keep it simple.

### 8. Error Handling

**Item not found when moving/updating:**
- Search all sections for similar text
- Suggest closest matches: "I couldn't find 'auth flow'. Did you mean 'Implement authentication'?"
- If no matches, ask user to clarify

**Item appears in multiple sections:**
- Warn user: "Found 'auth flow' in both In Progress and Up Next. Which one should I update?"
- Wait for clarification before making changes

**Ambiguous sub-task placement:**
- Ask: "Should 'add login endpoint' go under 'Implement auth flow' or as a new item?"
- Default to asking rather than guessing wrong

### 9. Common Operations

**"Add a task" / "Create todo" / "Update todo with X":**
1. Determine section (default: Up Next, or ask)
2. Check for related existing tasks
3. Add as sub-task or new item

**"Mark X as done" / "Complete X":**
1. Find item in In Progress (or other sections)
2. Summarize if it has sub-tasks
3. Move to top of Done as checked item

**"What's in progress?" / "Show me the todo":**
1. Read and display requested section(s)

**"Move X to in progress" / "Start working on X":**
1. Find item in Up Next or Backlog
2. Move to In Progress section

**"Add sub-task to X":**
1. Find parent task X
2. Add indented checkbox under it

## Examples

### Example 1: Adding a Related Task

**User:** "Add a task to write tests for the login endpoint"

**Current TODO.md:**
```markdown
## In Progress
- [ ] Implement auth flow
  - [x] Add login endpoint
  - [ ] Add logout endpoint
```

**Action:** Recognize "login endpoint" relates to "Implement auth flow"

**Result:**
```markdown
## In Progress
- [ ] Implement auth flow
  - [x] Add login endpoint
  - [ ] Add logout endpoint
  - [ ] Write tests for login endpoint
```

### Example 2: Completing a Task with Sub-tasks

**User:** "Mark auth flow as done"

**Current:**
```markdown
## In Progress
- [ ] Implement auth flow
  - [x] Add login endpoint
  - [x] Add logout endpoint
  - [x] Add password reset

## Done
- [x] Update database schema
```

**Result:**
```markdown
## In Progress

## Done
- [x] Implement auth flow (login, logout, password reset)
- [x] Update database schema
```

### Example 3: Ambiguous Task Placement

**User:** "Add task: update API documentation"

**Current:**
```markdown
## Up Next
- [ ] Refactor API endpoints
- [ ] Write user guide
```

**Response:** "Should 'update API documentation' go under 'Refactor API endpoints', under 'Write user guide', or as a new item?"

### Example 4: Item Not Found

**User:** "Mark authentication as done"

**Current TODO.md has:** `- [ ] Implement auth flow`

**Response:** "I couldn't find 'authentication'. Did you mean 'Implement auth flow'?"

### Example 5: Proactive Suggestion

**Context:** You just fixed a critical bug in the auth code and notice error logging is missing.

**Prompt:** "I noticed the auth endpoints don't have error logging. Should I add '[HIGH] Add error logging to auth endpoints' to the TODO list?"

**User response determines action.**

## Notes

- Done section grows over time (newest at top)—user can manually archive if needed
- Sub-task details are for In Progress/Up Next; Done is the summary view
- When in doubt, ask rather than assume
- Priority markers are optional—only add when user indicates urgency
- When moving tasks between sections, preserve sub-task checkbox states
