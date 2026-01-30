# Claude Skills

This directory contains Claude Code skills - reusable instruction sets that enhance Claude's capabilities for specific tasks and workflows.

## What are Skills?

Skills are specialized instruction modules that Claude can load to perform specific tasks more effectively. Think of them as expert personas or specialized toolkits that provide:

- **Domain-specific knowledge**: Best practices, conventions, and patterns for specific technologies or workflows
- **Structured workflows**: Step-by-step processes for complex tasks
- **Context-aware guidance**: Instructions that adapt based on project structure and requirements
- **Consistency**: Reproducible approaches to common development tasks

## Key Components

### Skill Structure

A skill typically consists of:

```
~/.claude/skills/
├── skill-name.md           # Individual skill definition
└── category/
    └── specialized-skill.md
```

### Skill Definition Format

Each skill file contains:

1. **Title**: Clear name describing the skill's purpose
2. **Description**: What the skill does and when to use it
3. **Instructions**: Detailed guidance for Claude to follow
4. **Examples**: Demonstrations of the skill in action (optional)
5. **Prerequisites**: Required tools, context, or setup (optional)

### Example Skill Template

```markdown
# Skill: [Name]

## Description
[What this skill does and when to use it]

## Instructions
[Detailed step-by-step instructions for Claude]

## Examples
[Optional: Example scenarios and expected outputs]

## Prerequisites
[Optional: Required tools, configuration, or context]
```

## Usage

### Loading a Skill

Skills are loaded automatically by Claude when available. You can reference a skill by:

```bash
# In Claude Code CLI
claude --skill skill-name "perform task using this skill"
```

Or in conversation:

```
User: "Use the [skill-name] skill to help me with X"
Claude: *loads skill and applies instructions*
```

### Creating Custom Skills

1. **Create a new skill file** in `~/.claude/skills/`:
   ```bash
   touch ~/.claude/skills/my-skill.md
   ```

2. **Define the skill** using the template format above

3. **Test the skill** by asking Claude to use it:
   ```
   "Use the my-skill skill to help with this task"
   ```

### Managing Skills

```bash
# List available skills
ls ~/.claude/skills/

# Edit a skill
$EDITOR ~/.claude/skills/skill-name.md

# Remove a skill
rm ~/.claude/skills/skill-name.md
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

After stowing, the skills directory will be symlinked to `~/.claude/skills/`, making your skills available to Claude Code.

## Best Practices

1. **Be Specific**: Write clear, actionable instructions that minimize ambiguity
2. **Stay Focused**: Each skill should address one primary task or workflow
3. **Include Context**: Explain when and why to use the skill
4. **Iterate**: Refine skills based on real usage and results
5. **Document**: Add examples and prerequisites to make skills self-explanatory
6. **Version Control**: Keep skills in this dotfiles repo for portability and versioning

## Resources

- [Claude Code Documentation](https://docs.anthropic.com/claude/docs/claude-code)
- [Prompt Engineering Guide](https://docs.anthropic.com/claude/docs/prompt-engineering)
- [GNU Stow Manual](https://www.gnu.org/software/stow/manual/stow.html)
