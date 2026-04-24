---
name: technical-writing-style
description: Defines voice, tone, and style for all technical writing. Casual-professional, anti-AI-slop. Use when writing or editing any documentation, README, prose, or technical content, or when user says "write this up", "document this", "fix the tone", "clean this up", "remove the AI slop", or "make this less formal".
version: 1.0.0
author: jdwork
category: documentation
---

# Skill: Technical Writing Style

## Description

Defines the voice and tone for all technical writing. Casual-professional: direct, human, and useful without being corporate, marketing-y, or AI-sounding. Applies when writing new docs and when editing existing ones.

## Core Philosophy

- Clear over formal
- Direct over marketing
- Casual-professional over corporate
- Useful over impressive
- Keep what helps, cut what shows off

## Voice & Tone

Write like a sharp engineer explaining something to a peer. Contractions are fine. First person is fine when it fits. Short sentences are fine. The reader is competent and busy, so respect their time.

Don't be robotic or cold. The goal is human, not minimal.

## What to Avoid (AI Slop)

**Marketing language:**
- "fully-configured", "seamless integration", "comprehensive solution", "enterprise-grade"
- "Designed to be simple, modular, and easy to extend"
- Stacking adjectives in triplets ("simple, powerful, and flexible")

**Corporate formality:**
- "It is recommended that...", "Please ensure that...", "Please note that..."
- "Best Practices", "Additional Resources", "Getting Help" (when simpler headings work)
- SHOUTING labels like "**SECURITY:**" or "**NOTE:**" when context makes it obvious

**Filler and fluff:**
- Intro paragraphs that restate the title
- Sections that exist for structure but add no information
- Explaining things the reader already knows
- Governance theater: security notes, compliance language, or disclaimers that serve no practical purpose in context

**Over-formatting:**
- Tables of contents for short documents
- Deeply nested numbered lists when flat structure works
- Checkbox bullets (✅) outside of actual task lists
- FAQ in "Q:" / "**A:**" format when a simpler heading works fine

## Punctuation

- **No em dashes.** Ever. They're an AI writing tell at this point. Use a comma, a period, a colon, or parentheses instead. Rewrite the sentence if none of those work.
- Hyphens and en dashes for their normal purposes (compound words, ranges) are fine.

## Emoji

A formatting tool, not decoration. Use selectively when they genuinely aid scanning: a status indicator, a visual anchor in a dense list, a type label. Don't scatter them across every heading. If removing an emoji changes nothing about readability, it shouldn't be there.

## Structure

- Lead with what the reader needs, not with background
- Use headings to create scannable structure, not to impose hierarchy for its own sake
- Keep sections proportional to their importance
- Prefer prose for explanation, lists for reference, tables for comparison
- If a section could be one sentence, make it one sentence

## When Editing Existing Docs

Before rewriting, figure out context:
- **Audience**: Personal use, teammates, AI agents, public?
- **Purpose**: Reference doc, quick start, tutorial, spec?
- **Existing voice**: Read surrounding docs and match the tone if it's good, fix it if it isn't

Preserve all useful technical content. Don't cut commands, paths, config samples, troubleshooting steps, or diagrams that actually explain something. The goal is better writing, not shorter writing.

## Examples

**Marketing to direct:**
- ❌ "A fully-configured, reproducible development environment with seamless terminal integration"
- ✅ "Docker container with dev tools and terminal access"

**Formal to casual-professional:**
- ❌ "It is recommended that users configure their API keys prior to initial setup"
- ✅ "Set up your API keys before you start"

**Fluff to substance:**
- ❌ "This configuration is designed to be simple, modular, and easy to extend, using lazy.nvim for efficient plugin management."
- ✅ "Neovim config using lazy.nvim for plugin management."

**Over-structured to right-sized:**
- ❌ "### Q: How much disk space does this use?\n**A:** The base image requires approximately 2GB of disk space."
- ✅ "**Disk space?** Base image is ~2GB, plus your projects."

**Security theater to practical:**
- ❌ "**🔒 SECURITY:** API keys are stored securely on a separate device following industry best practices"
- ✅ "API keys live in ~/.env on your host, not in git."

## Adjusting by Context

This is a base voice, not a straitjacket:

- **Personal projects:** Full casual, first person, "my setup" language
- **Tutorials and guides:** Warmer, more conversational, step-by-step is fine
- **Reference docs:** Terse is good, personality is optional
- **Specs and proposals:** Tighter register, still avoid slop
- **Agent instructions (AGENTS.md):** Stay formal and precise. Agents aren't peers.

## Notes

When in doubt: read it back to yourself. If it sounds like something a person would say to a coworker, it's right. If it sounds generated to impress a prompt, rewrite it.
