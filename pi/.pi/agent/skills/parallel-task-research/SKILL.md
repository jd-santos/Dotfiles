---
name: parallel-task-research
description: >-
  Evaluates web research requests and proposes Parallel Task MCP deep research
  or enrichment when it would beat quick search. Use when the user asks to
  search, research, investigate, or gather web information, or says "search
  for", "research", "find out about", "look into", or "deep dive".
version: 1.0.0
author: jdwork
category: workflow
---

# Skill: Parallel Task Research

## Description

The `parallel-task` MCP server runs deep research and data enrichment tasks on
the web through the Parallel Task API. It is stronger than quick search tools
such as `web_search` and `web_fetch` when a request needs multi-step reasoning
over many sources, a structured report, or enrichment of an existing dataset.
This skill defines when to propose a Parallel task instead of answering with
quick search, and how to run the task once approved.

## Instructions

### 1. Pre-flight Checks

Before proposing or running a task:

- [ ] Confirm the `parallel-task` server appears in `/mcp` and its tools are
      available: `createDeepResearch`, `createTaskGroup`, `getStatus`,
      `getResultMarkdown`
- [ ] If the tools are missing, remind the user that the server needs
      `PARALLEL_API_KEY` (an `op://` reference resolved by the `~/bin/pi`
      wrapper) and a Pi restart
- [ ] Confirm the request actually involves web information. Skip this skill
      for codebase questions, local files, or anything answerable from context

### 2. Decide: Quick Search or Parallel Task

Use quick search tools directly when the request is:

- A single fact, definition, version number, or current price
- A lookup answerable from one or two pages
- Time-sensitive chit-chat where the user expects an immediate answer
- Cheap to retry if the first search misses

Propose a Parallel task when the request is:

- A deep research question needing many sources, cross-referencing, or a
  written report ("compare X and Y across these dimensions", "write a landscape
  of...")
- Dataset enrichment: the user has a CSV, table, or list of entities and wants
  web-derived columns or attributes added
- A question where quick search already failed or returned shallow results
- Anything the user describes as "thorough", "comprehensive", "in-depth", or a
  "deep dive" (their word, used here as a trigger)

When proposing, keep it to two or three sentences: what the task would
investigate, what output it produces (markdown report or enriched rows), and
that it runs asynchronously and may take minutes and incur API cost. Then wait
for explicit approval. Never launch a task without the user's go-ahead.

### 3. Run the Task

After approval:

1. **Deep research**: call `createDeepResearch` with a focused, self-contained
   research question. Include scope, comparison dimensions, and any sources to
   prefer or exclude.
2. **Enrichment**: call `createTaskGroup` with the input rows and clear field
   specifications for each column to derive.
3. Note the returned task or group ID, then tell the user it is running.
4. Poll `getStatus` periodically. Do not block the conversation; report
   progress between other work when possible.
5. When complete, call `getResultMarkdown` and summarize the findings in chat.
   Offer to save the full report to a file when it is long.

### 3a. Tool Naming

Tool names may appear in camelCase (`createDeepResearch`) or snake_case
(`create_deep_research`) depending on how the server exposes them. Check `/mcp`
or `mcp({ search: "parallel" })` for the registered names before calling.

### 4. Error Handling

If a task fails or stalls:

1. Call `getStatus` and read the error or state detail
2. Do not silently retry with the same input; adjust the question or field
   specs first, then ask the user before spending on another run
3. If the server is unreachable or auth fails, fall back to quick search tools
   and tell the user the task path is unavailable

## Examples

### Proposing a Deep Research Task

**User:** "How do the current batch of local-first sync engines compare for a
small CRDT-based note app?"

**Result:** The request needs comparison across many projects and sources.
The agent proposes: "This would benefit from a Parallel deep research task. It
would compare sync engines (Automerge, Yjs, ElectricSQL, Zero, and others)
across conflict handling, offline support, and operational cost, then return a
markdown report. It runs in the background and may take a few minutes. Want me
to kick it off?" On approval, the agent calls `createDeepResearch` and reports
the task ID.

### Staying with Quick Search

**User:** "What's the current stable version of Node?"

**Result:** A single fact. The agent answers directly with `web_search` and
does not mention Parallel tasks.

### Enrichment Task

**User:** "Here's a CSV of 40 conference talks. Add the speaker's employer
and a one-line talk summary for each."

**Result:** Dataset enrichment. The agent proposes a `createTaskGroup` run
with one field spec per new column, waits for approval, then runs it.

## Notes

- Tasks cost money and take minutes. Propose, never presume.
- Quick search and Parallel tasks compose: a quick search to scope the
  question often produces a better task prompt.
- Pi reads the generated MCP config at `~/.pi/agent/mcp.json`, built from the
  tracked `pi/.pi/agent/mcp.base.json` and optional local overrides.
- The stowed `~/.config/mcp/mcp.json` is for other clients; Pi does not read it.

## Cross-Reference

- Server setup and key resolution: `pi/docs/reference.md` in the dotfiles repo
- For deciding when a full report should instead become a review artifact, see
  the `offgrid-review` skill
