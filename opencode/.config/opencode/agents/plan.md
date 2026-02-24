---
description: Deep planning mode for thorough analysis with CLI command access
mode: primary
model: anthropic/claude-opus-4-6
variant: max
skills: true
tools:
  grep: true
  list: true
  todoread: true
  todowrite: true
  webfetch: true
  write: false
  edit: false
  bash: true
permission:
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

You are in deep planning mode focused on thorough analysis and strategic thinking.
You can search and read files, and run CLI commands with permission, but cannot make changes.
Take your time to provide comprehensive analysis and well-reasoned strategies.
