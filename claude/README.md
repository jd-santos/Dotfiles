# Claude Skills

This directory contains OpenCode/Claude Code skills - reusable instruction sets that enhance AI agent capabilities for specific tasks and workflows.

## What are Skills?

Skills are specialized instruction modules that Claude can load to perform specific tasks more effectively. Think of them as expert personas or specialized toolkits that provide:

- **Domain-specific knowledge**: Best practices, conventions, and patterns for specific technologies or workflows
- **Structured workflows**: Step-by-step processes for complex tasks
- **Context-aware guidance**: Instructions that adapt based on project structure and requirements
- **Consistency**: Reproducible approaches to common development tasks

## Key Components

### Skill Structure

Skills follow the OpenCode format:

```
~/.claude/skills/
├── skill-name/
│   └── SKILL.md           # Skill definition (must be named SKILL.md)
├── another-skill/
│   └── SKILL.md
└── example-skill/
    └── SKILL.md
```

**Important**: Each skill must:
- Have its own directory named after the skill (lowercase with hyphens)
- Contain a file named exactly `SKILL.md` (all caps)

### Skill Definition Format

Each `SKILL.md` file must start with YAML frontmatter:

```yaml
---
name: skill-name              # Required: must match directory name
description: Brief description # Required: 1-1024 characters
license: MIT                   # Optional
compatibility: opencode        # Optional
metadata:                      # Optional: string-to-string map
  audience: developers
  workflow: git
---
```

Followed by the skill content:

1. **What I do**: Clear explanation of the skill's capabilities
2. **When to use me**: Guidance on when to invoke this skill
3. **Instructions**: Detailed step-by-step guidance
4. **Examples**: Demonstrations of the skill in action (optional)
5. **Prerequisites**: Required tools, context, or setup (optional)

### Example Skill Template

```markdown
---
name: example-skill
description: Does something useful for developers
license: MIT
compatibility: opencode
metadata:
  audience: developers
---

## What I do
- Provide clear, actionable guidance
- Follow best practices for the domain
- Offer concrete examples

## When to use me
Use this skill when you need to [specific use case].
Ask clarifying questions if [conditions are unclear].

## Instructions
[Detailed step-by-step instructions]

## Examples
[Optional: Example scenarios and expected outputs]

## Prerequisites
[Optional: Required tools, configuration, or context]
```

## Usage

### Loading a Skill

In OpenCode/Claude Code, skills are loaded on-demand via the `skill` tool. Agents see available skills and can load them when needed.

**Enable skills for an agent** by adding to the agent's frontmatter:

```yaml
---
skills: true
tools:
  skill: true  # Optional: explicitly enable the skill tool
---
```

Or in conversation, you can reference a skill:

```
User: "Use the create-agents-md skill to help me with X"
Agent: *loads skill and applies instructions*
```

### Creating Custom Skills

1. **Create a skill directory** in `~/.claude/skills/`:
   ```bash
   mkdir -p ~/.claude/skills/my-skill
   ```

2. **Create the SKILL.md file**:
   ```bash
   touch ~/.claude/skills/my-skill/SKILL.md
   ```

3. **Define the skill** using the template format above with YAML frontmatter

4. **Enable skills** in your agent configuration (see Usage section)

5. **Test the skill** by asking the agent to use it:
   ```
   "Use the my-skill skill to help with this task"
   ```

### Managing Skills

```bash
# List available skills
ls ~/.claude/skills/

# Edit a skill
$EDITOR ~/.claude/skills/skill-name/SKILL.md

# Remove a skill
rm -rf ~/.claude/skills/skill-name/
```

## Skill Ideas

Here are some examples of useful skills you might create:

- **Code Review**: Systematic code review checklist and best practices
- **API Design**: RESTful API design principles and patterns
- **Testing Strategy**: Comprehensive testing approach for different project types
- **Documentation**: Technical documentation standards and structure
- **Debugging**: Systematic debugging methodology
- **Performance Optimization**: Performance analysis and optimization workflow
- **Security Audit**: Security review checklist and common vulnerabilities
- **Refactoring**: Safe refactoring patterns and strategies

## Integration with Dotfiles

This Claude configuration follows the GNU Stow pattern used in this dotfiles repository:

```bash
# Install Claude configuration
stow claude

# Uninstall
stow -D claude

# Restow (useful after updates)
stow -R claude
```

After stowing, the skills directory will be symlinked to `~/.claude/skills/`, making your skills available to OpenCode/Claude Code.

## Best Practices

1. **Be Specific**: Write clear, actionable instructions that minimize ambiguity
2. **Stay Focused**: Each skill should address one primary task or workflow
3. **Include Context**: Explain when and why to use the skill
4. **Iterate**: Refine skills based on real usage and results
5. **Document**: Add examples and prerequisites to make skills self-explanatory
6. **Version Control**: Keep skills in this dotfiles repo for portability and versioning

## Resources

- [OpenCode Skills Documentation](https://opencode.ai/docs/skills/)
- [OpenCode Agents Documentation](https://opencode.ai/docs/agents/)
- [Claude Code Documentation](https://docs.anthropic.com/claude/docs/claude-code)
- [Prompt Engineering Guide](https://docs.anthropic.com/claude/docs/prompt-engineering)
- [GNU Stow Manual](https://www.gnu.org/software/stow/manual/stow.html)
