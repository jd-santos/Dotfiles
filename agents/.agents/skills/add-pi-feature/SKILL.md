---
name: add-pi-feature
description: "Adds pi coding agent features: skills, extensions, prompt templates, themes, custom tools, commands, shortcuts, and flags. Use when setting up a new pi workflow, adding a slash command, building an extension, creating a prompt template, or when user says 'add a pi feature', 'create a pi extension', 'make a pi skill', or 'set up pi'."
version: 1.0.0
author: jdwork
category: workflow
---

# Skill: Add Pi Feature

## Description

Guides implementing pi features including skills, TypeScript extensions, prompt templates, and themes. Each feature type has specific placement rules, format requirements, and reload behavior.

## Pre-flight Checks

Before implementing:

1. **Identify the feature type** - ask the user if unclear:
   - **Skill** - reusable instruction set for repeatable workflows (loaded on-demand by the LLM)
   - **Extension** - TypeScript module that adds tools, commands, shortcuts, or hooks into pi events
   - **Prompt template** - Markdown snippet that expands when user types `/name`
   - **Theme** - JSON color definition for the TUI

2. **Identify scope** - global (`~/.pi/agent/`) vs project-local (`.pi/`):
   - Global: available in every project
   - Project-local: checked into the repo, shared with the team

3. **Check for conflicts** - look for existing files with the same name before creating

## Feature Workflows

---

### A. Skills

**Location:**
- Global: `~/.pi/agent/skills/<name>/SKILL.md` or `~/.agents/skills/<name>/SKILL.md`
- Project: `.pi/skills/<name>/SKILL.md` or `.agents/skills/<name>/SKILL.md`

**Rules:**
- Directory name must match the `name` field in frontmatter
- Name: lowercase, letters/numbers/hyphens only, 1-64 chars, no leading/trailing/consecutive hyphens
- Description is required and determines when the LLM loads the skill

**Steps:**

1. Create the skill directory:
   ```bash
   mkdir -p ~/.agents/skills/<name>
   # or for project-local:
   mkdir -p .agents/skills/<name>
   ```

2. Write `SKILL.md` with frontmatter and body (see template below)

3. Verify with `/reload` in pi - skill appears in system prompt `<available_skills>`

**SKILL.md template:**

```markdown
---
name: <name>
description: <verb-first what it does>. Use when <trigger scenarios> or when user says "<trigger phrases>".
version: 1.0.0
author: jdwork
category: <workflow|automation|code-quality|database|documentation|meta|security|testing>
---

# Skill: <Human Name>

## Description

<What this skill does and when to use it.>

## Instructions

### 1. Pre-flight Checks

Before running:
- [ ] Check <requirement>
- [ ] Verify <requirement>

### 2. Workflow

1. **Step one**: <action>
2. **Step two**: <action>

### 3. Error Handling

If the skill fails:
1. <Recovery action>

## Examples

### Basic Usage

**User:** "<example request>"
**Result:** <expected outcome>
```

**Description writing rules:**
- Start with action verb (Creates, Runs, Audits, Generates, Deploys)
- Include technology keywords users might say
- Add "Use when..." with specific scenarios and exact trigger phrases
- Max 1024 characters

---

### B. Extensions

**Location:**
- Global: `~/.pi/agent/extensions/<name>.ts` or `~/.pi/agent/extensions/<name>/index.ts`
- Project: `.pi/extensions/<name>.ts` or `.pi/extensions/<name>/index.ts`

**Steps:**

1. Create the extension file
2. Export a default function that receives `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // --- Events ---
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash") {
      if (event.input.command?.includes("rm -rf")) {
        const ok = await ctx.ui.confirm("Dangerous", "Allow rm -rf?");
        if (!ok) return { block: true, reason: "Blocked by user" };
      }
    }
  });

  // --- Custom tool ---
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "What this tool does",
    parameters: Type.Object({
      input: Type.String({ description: "The input" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `Result: ${params.input}` }],
        details: {},
      };
    },
  });

  // --- Custom command ---
  pi.registerCommand("my-cmd", {
    description: "Description shown in autocomplete",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Running: ${args}`, "info");
    },
  });

  // --- Keyboard shortcut ---
  pi.registerShortcut("ctrl+shift+m", {
    description: "Do something",
    handler: async (ctx) => {
      ctx.ui.notify("Shortcut fired!", "info");
    },
  });
}
```

3. Test without restarting pi using the `-e` flag:
   ```bash
   pi -e ./my-extension.ts
   ```

4. Once placed in `~/.pi/agent/extensions/` or `.pi/extensions/`, reload with `/reload`

**Key event hooks:**

| Event | Use for |
|-------|---------|
| `session_start` | Initialize state, show welcome message |
| `tool_call` | Block or modify tool calls before execution |
| `tool_result` | Modify tool output after execution |
| `before_agent_start` | Inject context, modify system prompt per turn |
| `context` | Filter or prune messages before each LLM call |
| `agent_end` | Post-turn cleanup or notifications |
| `session_shutdown` | Cleanup before exit or session switch |

**Key API methods:**

| Method | Use for |
|--------|---------|
| `pi.registerTool(def)` | Add a custom tool the LLM can call |
| `pi.registerCommand(name, opts)` | Add a `/command` |
| `pi.registerShortcut(keys, opts)` | Add a keyboard shortcut |
| `pi.registerFlag(name, opts)` | Add a CLI flag |
| `pi.sendUserMessage(text)` | Send a message as the user |
| `pi.appendEntry(type, data)` | Persist state across restarts |
| `ctx.ui.notify(msg, level)` | Show a notification (`info`, `success`, `warning`, `error`) |
| `ctx.ui.confirm(title, msg)` | Show a yes/no dialog |
| `ctx.ui.select(title, items)` | Show a selection list |

**Multi-file extensions** (when you need npm dependencies):

```
~/.pi/agent/extensions/my-extension/
├── index.ts
├── package.json          # declare dependencies here
├── package-lock.json
└── node_modules/         # after npm install
```

Run `npm install` in the extension directory before using.

---

### C. Prompt Templates

**Location:**
- Global: `~/.pi/agent/prompts/<name>.md`
- Project: `.pi/prompts/<name>.md`

**Steps:**

1. Create the file - the filename (without `.md`) becomes the `/command` name

2. Write the template:

```markdown
---
description: <What this template does>
argument-hint: "<arg1> [optional-arg2]"
---
<Template content here. Use $1, $2, $@ for arguments.>
```

3. Invoke with `/name` in the pi editor. Reload with `/reload` after creating.

**Argument syntax:**
- `$1`, `$2` - positional arguments
- `$@` or `$ARGUMENTS` - all arguments joined
- `${@:2}` - arguments from position 2 onward
- `${@:1:2}` - first two arguments

**Example:**

```markdown
---
description: Review a specific file for bugs and security issues
argument-hint: "<file-path>"
---
Review `$1` for:
- Logic errors and edge cases
- Security vulnerabilities
- Error handling gaps
- Code clarity improvements
```

Invoked as: `/review src/auth.ts`

---

### D. Themes

**Location:**
- Global: `~/.pi/agent/themes/<name>.json`
- Project: `.pi/themes/<name>.json`

**Steps:**

1. Create the JSON file - `name` field must match the filename (without `.json`)

2. Define all 51 required color tokens (use vars for reuse):

```json
{
  "$schema": "https://raw.githubusercontent.com/earendil-works/pi-mono/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  "name": "<theme-name>",
  "vars": {
    "primary": "#<hex>",
    "secondary": <256-color-index>
  },
  "colors": {
    "accent": "primary",
    "border": "primary",
    "borderAccent": "#<hex>",
    "borderMuted": "secondary",
    "success": "#<hex>",
    "error": "#<hex>",
    "warning": "#<hex>",
    "muted": "secondary",
    "dim": <256-index>,
    "text": "",
    "thinkingText": "secondary",
    "selectedBg": "#<hex>",
    "userMessageBg": "#<hex>",
    "userMessageText": "",
    "customMessageBg": "#<hex>",
    "customMessageText": "",
    "customMessageLabel": "primary",
    "toolPendingBg": "#<hex>",
    "toolSuccessBg": "#<hex>",
    "toolErrorBg": "#<hex>",
    "toolTitle": "primary",
    "toolOutput": "",
    "mdHeading": "#<hex>",
    "mdLink": "primary",
    "mdLinkUrl": "secondary",
    "mdCode": "#<hex>",
    "mdCodeBlock": "",
    "mdCodeBlockBorder": "secondary",
    "mdQuote": "secondary",
    "mdQuoteBorder": "secondary",
    "mdHr": "secondary",
    "mdListBullet": "#<hex>",
    "toolDiffAdded": "#<hex>",
    "toolDiffRemoved": "#<hex>",
    "toolDiffContext": "secondary",
    "syntaxComment": "secondary",
    "syntaxKeyword": "primary",
    "syntaxFunction": "#<hex>",
    "syntaxVariable": "#<hex>",
    "syntaxString": "#<hex>",
    "syntaxNumber": "#<hex>",
    "syntaxType": "#<hex>",
    "syntaxOperator": "primary",
    "syntaxPunctuation": "secondary",
    "thinkingOff": "secondary",
    "thinkingMinimal": "primary",
    "thinkingLow": "#<hex>",
    "thinkingMedium": "#<hex>",
    "thinkingHigh": "#<hex>",
    "thinkingXhigh": "#<hex>",
    "bashMode": "#<hex>"
  }
}
```

3. Activate via `/settings` > theme selector, or in `settings.json`:
   ```json
   { "theme": "<name>" }
   ```

4. The theme hot-reloads while active - edit and see changes immediately.

**Color value formats:**
- `"#rrggbb"` - hex RGB
- `242` - xterm 256-color index (0-255)
- `"varname"` - reference to a `vars` entry
- `""` - terminal default color

---

## Error Handling

**Skill not appearing:** Check that:
- Directory name exactly matches `name` in frontmatter
- Description is present (skills without it are skipped)
- Run `/reload` after creating

**Extension not loading:** Check that:
- File is in an auto-discovered location (`~/.pi/agent/extensions/` or `.pi/extensions/`)
- TypeScript compiles (jiti handles it, but syntax errors will show on startup)
- Run `/reload` after changes, or restart pi

**Prompt template not expanding:** Check that:
- File is in `~/.pi/agent/prompts/` or `.pi/prompts/`
- Filename contains no spaces (use hyphens)
- Run `/reload` after creating

**Theme not applying:** Check that:
- `name` field matches filename exactly (without `.json`)
- All 51 color tokens are present
- JSON is valid

## Notes

- Extensions run with your full system permissions. Only install from sources you trust.
- Use `pi -e ./extension.ts` to test an extension before placing it in an auto-discovered location.
- Skills are loaded on-demand - the LLM reads the description to decide when to load the full content. Write descriptions for retrieval accuracy.
- Project-local features (`.pi/`) are repo-specific. Global features (`~/.pi/agent/`) apply everywhere.
- All feature types support `/reload` for hot-reloading without restarting pi.

## Cross-Reference

- Pi extensions docs: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- Pi skills docs: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/skills.md`
- Pi prompt templates docs: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/prompt-templates.md`
- Pi themes docs: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/themes.md`
- Extension examples: `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/`
- For creating skills specifically, see the `create-skill` skill
