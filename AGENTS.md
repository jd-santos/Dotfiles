# AGENTS.md

> This file provides context for AI agents working in this dotfiles repository.

## Project Context
- **Project**: Personal dotfiles managed with GNU Stow
- **Structure**: Each top-level directory is a stow package that mirrors `$HOME` structure internally
- **Deployment**: Files symlinked via `stow <package>` (e.g., `stow nvim`)

## Critical Rules

- **GNU Stow Path Structure**: Package directories mirror `$HOME` paths. To create `~/.config/foo/bar`, use `foo/.config/foo/bar` (NOT `foo/bar`)
- **No Unified Commands**: No global build/test commands—validation happens when tools load their configs
- **Secrets Protection**: NEVER read `.env*`, `*credentials*`, `*secrets*`, `*.key`, `*.pem` files—provide diagnostic commands instead
- **Documentation Sync**: Update README.md keyboard shortcuts table when modifying keybindings in tmux/nvim configs

## General Guidelines

- **Tool-Specific Conventions:** Each directory corresponds to a different tool (e.g., `nvim`, `zsh`, `git`). Adhere to the specific syntax, conventions, and best practices of the tool whose configuration you are modifying.
- **Style Consistency:** When editing a file, maintain the existing code style, formatting, and naming conventions.

## File-Specific Notes

- **Lua (`.lua`):** For nvim configuration, follow standard Lua style.
- **TOML (`.toml`):** For starship configuration, follow TOML syntax.
- **Shell Scripts (`.zshrc`, `.fzf.zsh`):** Follow general shell scripting best practices.
- **JSON (`.json`):** Ensure valid JSON format.
- **XML (`.xml`):** Ensure valid XML format.
- **Markdown (`.md`):** For Claude skills and documentation, use clear formatting with proper headers, code blocks, and examples.

## Error Handling

- Since these are configuration files, error handling is generally not applicable in the traditional sense.
- Errors will typically be reported by the respective tool upon loading the configuration. Ensure your changes are syntactically correct to avoid breaking the tool's functionality.

## Claude Skills (`claude/` directory)

The `claude/` directory contains reusable instruction sets (skills) for Claude Code that enhance AI-assisted development workflows.

### Working with Skills

**Skill Structure:**
- Location: `claude/.claude/skills/`
- Format: Markdown files with structured sections (Title, Description, Instructions, Examples, Prerequisites)
- See [claude/README.md](claude/README.md) for detailed documentation

**When to reference skills:**
- Check existing skills before starting complex tasks
- Reference relevant skills in your approach to tasks
- Suggest creating new skills for recurring workflows

**Creating or modifying skills:**
- Follow the skill template format (see `claude/.claude/skills/example-skill.md`)
- Be specific and actionable in instructions
- Include concrete examples when helpful
- Keep each skill focused on one primary task or workflow
- Update `claude/README.md` if adding new skill categories

**Style guidelines for skills:**
- Use clear, imperative language ("Do X", not "You should do X")
- Break complex workflows into numbered steps
- Include code examples in appropriate language fences
- Document prerequisites and required tools
- Keep skills portable and not project-specific (use placeholders for project details)

## Documentation Guidelines

### Keyboard Shortcuts

When adding, modifying, or removing keyboard shortcuts or keybindings in any configuration file, update the README.md's "Keyboard Shortcuts" section to reflect the change.

**Current files with custom shortcuts include:**
- `tmux/.tmux.conf`
- `nvim/.config/nvim/lua/config/keymaps.lua`
- `nvim/.config/nvim/lua/plugins/*.lua`

**When to update README.md:**
- Adding a new keybinding → Add to the appropriate table in README
- Changing an existing keybinding → Update the shortcut in README
- Removing a keybinding → Remove from README

**What to document:**
- Only custom/user-defined shortcuts (not inherited defaults from frameworks like LazyVim)
- Include the key combination and a brief description
- Group by tool (Tmux, Neovim, etc.)

## CRITICAL: Secrets Protection

### .env Files - ABSOLUTE PROHIBITION

**NEVER read files containing secrets, even for debugging.**

Prohibited files:
- `.env*` (all variants)
- `*credentials*`, `*secrets*`, `*token*`, `*.key`, `*.pem`
- `.aws/credentials`, `.ssh/id_rsa*`

### When Users Request .env Help

**FORBIDDEN:**
- Reading file contents (cat, hexdump, grep, etc.)
- Attempting to redact/mask (you see secrets first - this FAILS)

**REQUIRED:**
- Provide diagnostic commands for USER to run
- Request non-sensitive structure description only
- Suggest: `bash -n .env`, `file .env`, encoding checks
- Explain common issues: line endings, export syntax, sourcing methods

**Template response:**
"I won't read .env to protect secrets. Instead: (1) What format? (e.g., `export VAR="value"`) (2) Run `bash -n .env` - errors? (3) Run `file .env` - encoding? (4) How do you source it?"

**Rationale:** Redaction requires reading first. Only safe approach: never read.
