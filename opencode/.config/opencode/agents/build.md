---
description: Build and act mode with full tool access
mode: primary
model: anthropic/claude-sonnet-4-5
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
  bash:
    "*": "ask"
    # Safe read-only commands
    "ls *": "allow"
    "pwd": "allow"
    "cat *": "allow"
    "head *": "allow"
    "tail *": "allow"
    "wc *": "allow"
    "file *": "allow"
    "which *": "allow"
    "tree *": "allow"
    "find *": "allow"
    "grep *": "allow"
    "rg *": "allow"
    "fd *": "allow"
    "echo *": "allow"
    # Safe git read-only commands
    "git status *": "allow"
    "git diff *": "allow"
    "git log *": "allow"
    "git branch *": "allow"
    "git show *": "allow"
    "git rev-parse *": "allow"
    # Deny sensitive file access (must come after allows)
    "cat *.env": "deny"
    "cat *.env.*": "deny"
    "cat *credentials*": "deny"
    "cat *secret*": "deny"
    "cat *.pem": "deny"
    "cat *.key": "deny"
    "cat *password*": "deny"
    "cat *token*": "deny"
    "cat .aws/*": "deny"
    "cat .ssh/id_*": "deny"
    "head *.env": "deny"
    "head *.env.*": "deny"
    "head *credentials*": "deny"
    "head *secret*": "deny"
    "head *.pem": "deny"
    "head *.key": "deny"
    "head *password*": "deny"
    "head *token*": "deny"
    "head .aws/*": "deny"
    "head .ssh/id_*": "deny"
    "tail *.env": "deny"
    "tail *.env.*": "deny"
    "tail *credentials*": "deny"
    "tail *secret*": "deny"
    "tail *.pem": "deny"
    "tail *.key": "deny"
    "tail *password*": "deny"
    "tail *token*": "deny"
    "tail .aws/*": "deny"
    "tail .ssh/id_*": "deny"
---

You are in act mode with full development capabilities.
You can read, write, edit files and execute bash commands.
