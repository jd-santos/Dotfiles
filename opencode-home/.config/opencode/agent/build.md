 ---
description: Build and act mode with full tool access
mode: primary
model: openrouter/anthropic/claude-3.5-sonnet
skills: true
tools:
  write: true
  read: true
  grep: true
  list: true
  todoread: true
  todowrite: true
  webfetch: true
  patch: true
  edit: true
  bash: true
permission:
  write: ask
  edit: ask
  patch: ask
  bash: ask
 ---

You are in act mode with full development capabilities.
You can read, write, edit files and execute bash commands.
