---
name: personal-docs-editor
description: Reviews and edits documentation to remove AI-generated corporate language, marketing speak, and excessive formality, transforming docs into casual personal tone while preserving technical information.
version: 1.0.0
author: jdwork
category: documentation
tags: [editing, tone, cleanup]
---

# Skill: Personal Documentation Editor

## Description

Reviews and edits documentation in personal projects (like dotfiles) to remove "AI slop" - overly formal, corporate, or prompt-responsive language. Transforms documentation into a casual, personal tone while preserving all useful technical information.

## Instructions

### 1. Identify AI Slop Patterns

Search for these red flags that indicate AI-generated corporate language:

**Tone & Style Issues:**
- Marketing language: "fully-configured", "seamless integration", "comprehensive solution"
- Corporate formality: "**SECURITY:**", "Best Practices", "Getting Started" (when simpler works)
- Prompt-responsive phrases: "designed to be simple, modular, and easy to extend"
- Excessive formality: "Please ensure that...", "It is recommended that..."
- FAQ sections that answer questions nobody asked
- Governance language: "Security Notes", "Compliance", "Best Practices"

**Formatting Issues:**
- Excessive emoji in section headers (1-2 per doc is fine, 10+ is too much)
- Bullet points with checkmarks (✅) - feels like marketing copy
- Overly nested numbered lists (### 1. Configure, ### 2. Setup, etc.)
- Table of Contents for docs under 200 lines
- ASCII diagrams that are for show (keep genuinely useful ones)

**Content Issues:**
- Explanatory sections that state the obvious
- Security notes that are just governance theater
- Extensive "Getting Help" sections for personal projects
- Over-structured TODO lists with checkbox hierarchies
- Contradictory or confusing comments

### 2. Assess Documentation Context

Before editing, determine:
- **Audience**: Personal use or for AI agents? (AGENTS.md should stay formal)
- **Purpose**: Reference docs can be detailed; quick starts should be brief
- **Existing tone**: Check main README for voice/style to match
- **Technical depth**: Keep all useful commands, troubleshooting, and details

### 3. Apply Personal Tone Transformations

**Replace marketing copy with direct statements:**
- ❌ "A fully-configured, reproducible development environment"
- ✅ "Docker container with Opencode and my dotfiles"

**Simplify formal language:**
- ❌ "**SECURITY:** Your API keys are stored securely..."
- ✅ "API keys live in ~/.env on your host (not in git)"

**Casual over corporate:**
- ❌ "Optional but Recommended"
- ✅ "optional but nice"
- ❌ "Prerequisites" → "What you need"
- ❌ "Additional Resources" → "Resources"

**Simplify FAQ format:**
- ❌ "### Q: Can I use VS Code?\n**A:** Yes! Install the..."
- ✅ "**VS Code?** Yes, install the..."

**Remove unnecessary formality:**
- ❌ "### 1. Configure API Keys"
- ✅ "### Configure API Keys"

**Fix confusing comments:**
- ❌ "Password: use your SSH key (no password needed)"
- ✅ "Uses your SSH key (no password needed)"

### 4. Preserve What's Useful

**Keep these elements:**
- ✅ All technical details, commands, and troubleshooting
- ✅ Diagrams that actually explain structure (ASCII art is fine if useful)
- ✅ Detailed instructions and step-by-step guides
- ✅ Code examples and configuration samples
- ✅ FAQ content (just make it less formal)
- ✅ Tables of keyboard shortcuts or command references
- ✅ Table of contents for genuinely long docs (200+ lines)

### 5. Maintain Consistency

Ensure tone matches across all docs in the project:
- Check main README for the project's voice
- Personal projects: casual, first-person okay ("my setup", "I use")
- Configuration for tools: straightforward, no fluff
- Comments in code: minimal, purposeful, clear

### 6. Execute the Edits

**Workflow:**
1. **Scan**: Find all .md, README, and heavily-commented config files
2. **Review**: Read through and identify AI slop patterns
3. **Report**: List findings by file with severity (High/Medium/Low priority)
4. **Confirm**: Ask user which files to edit and what to preserve
5. **Edit**: Make changes systematically, preserving technical content
6. **Summary**: Report what was changed and why

**Key principles:**
- Never remove useful technical information
- Keep diagrams if they explain something
- Simplify tone without losing clarity
- Remove emoji spam but 1-2 for visual scanning is okay
- Make it sound like a human wrote notes for themselves

## Examples

### Example 1: Marketing Language

**Before:**
```markdown
## 🚀 Features

- ✅ Fully-configured development environment
- ✅ Seamless terminal integration
- ✅ Enterprise-grade security practices
```

**After:**
```markdown
## Features

Docker container with my dev tools, SSH access, and API keys stored outside git.
```

### Example 2: Formal FAQ

**Before:**
```markdown
### Q: How much disk space does this use?

**A:** The base image requires approximately 2GB of disk space.
```

**After:**
```markdown
**Disk space?** Base image is ~2GB, plus your projects.
```

### Example 3: Security Theater

**Before:**
```markdown
## 🔒 Security Notes

- API keys stored on separate device following best practices
- SSH uses key-based authentication only (no passwords)
- Container runs as non-root user for enhanced security
- Read-only mounts prevent accidental modification
```

**After:**
```markdown
API keys live in ~/.env on your host (not in git). SSH uses keys, not passwords.
```

### Example 4: Prompt-Responsive Language

**Before:**
```markdown
This configuration is designed to be simple, modular, and easy to extend,
using lazy.nvim for efficient plugin management.
```

**After:**
```markdown
My Neovim setup using lazy.nvim for plugin management.
```

## Detection Heuristics

Use these patterns to automatically flag AI slop:

**Regex patterns to search for:**
- `designed to be \w+, \w+, and \w+`
- `fully[- ]configured`
- `seamless(ly)? integrat(e|ion)`
- `best practices?`
- `ensure that`
- `please note`
- `it is (recommended|important|advised)`
- `\*\*SECURITY:\*\*`
- Multiple consecutive emoji headers: `^## [🎯🚀📦🛠️🔧]`

**Structural patterns:**
- 5+ emoji in headers within same document
- Sections named "Getting Help" in personal projects
- "Prerequisites" sections with nested bold headers
- FAQ with "Q:" and "**A:**" format
- TODO lists with `### 1.`, `### 2.` numbering

## Prerequisites

- None - works on any documentation
- Most effective on personal projects (dotfiles, tools, scripts)
- Can be adapted for team docs by adjusting tone guidelines

## Notes

**When NOT to use this skill:**
- Documentation meant for external users (keep it clear and helpful)
- Agent instructions (AGENTS.md should stay formal and precise)
- Technical specifications that need formal language
- When user wants to keep corporate style

**Remember:**
- Personal documentation is for YOU - make it useful, not impressive
- Clear > formal
- Direct > marketing
- Casual > corporate
- Keep what helps, cut what shows off

**Balance:**
- Don't remove politeness, just formality
- Don't remove structure, just over-structure
- Don't remove detail, just fluff
- Don't remove emoji entirely, just excessive use
