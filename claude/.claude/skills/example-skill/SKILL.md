---
name: example-skill
description: Template demonstrating Claude skill structure and format. Use when learning how skills work, viewing an example skill, or as a starting point for new skills.
version: 1.0.0
author: jdwork
category: meta
---

# Skill: Example Skill

## Description

This is a template/example skill that demonstrates the structure and format of a Claude skill. Use this as a starting point when creating your own custom skills.

## Instructions

When this skill is loaded, follow these guidelines:

1. **Understand the Task**
   - Read the user's request carefully
   - Identify the specific goal and desired outcome
   - Ask clarifying questions if needed

2. **Plan the Approach**
   - Break down complex tasks into smaller steps
   - Consider dependencies and prerequisites
   - Identify potential challenges or edge cases

3. **Execute Systematically**
   - Follow best practices for the relevant technology
   - Maintain consistent code style and conventions
   - Document important decisions and rationale

4. **Validate and Verify**
   - Test the implementation
   - Check for errors or issues
   - Ensure the solution meets requirements

5. **Communicate Clearly**
   - Explain what you're doing and why
   - Highlight important changes or considerations
   - Provide next steps or recommendations

## Examples

### Example 1: Simple Task
```
User: "Use the example skill to help me create a function"
Claude: Following the example skill workflow:
1. Understanding: You need a function created
2. Planning: I'll ask about parameters, return type, and purpose
3. Execution: [creates function with proper style]
4. Validation: [explains testing approach]
5. Communication: [explains the implementation]
```

### Example 2: Complex Task
```
User: "Use the example skill to refactor this module"
Claude: Applying the systematic approach:
1. Understanding: Analyzing current module structure
2. Planning: Identifying refactoring opportunities
3. Execution: Making improvements incrementally
4. Validation: Ensuring functionality is preserved
5. Communication: Documenting changes and benefits
```

## Prerequisites

- None - this is a general-purpose example skill
- Adapt the instructions for your specific use case

## Notes

This example skill demonstrates:
- Clear structure with numbered steps
- Actionable instructions
- Concrete examples
- Flexible guidelines that work across different contexts

When creating your own skills, customize each section to provide specific, relevant guidance for your particular use case.

### Writing Descriptions

The `description` field in frontmatter should be verb-first and include searchable keywords:

```yaml
# Good - verb-first, searchable
description: Runs database migrations safely with backup verification and rollback support for PostgreSQL databases.

# Bad - vague, passive
description: A skill for database stuff that helps with migrations.
```

Start with an action verb (Creates, Runs, Audits, Generates, Deploys) followed by what it does and relevant context.
