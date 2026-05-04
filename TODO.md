# Permission Gate Extension Improvements

## In Progress

## Backlog

- [ ] Deduplicate rules before pushing

## Done

1. ~~**feat(pi): add yolo mode and session rules to permission gate**~~
   - Add /yolo command, /rules, /reset-rules commands
   - Two-step TUI prompt with once/always/deny flow
   - Session rule engine with allow/deny lists
   - Status bar feedback

2. ~~**refactor(pi): two-step permission UX with better labels**~~
   - Replaced single combined prompt with two-step flow
   - Cohesive option labels with icons
   - Consistent indicator emojis
   - Cleaner prompt helper signatures

3. ~~**feat(pi): add parent/grandparent directory options**~~
   - getDirChain() helper for up to 3 directory levels
   - Directory scope options: 📁, 📂, 📂📂

6. ~~**fix(pi): security and maintability improvements**~~
   - Run deny patterns against raw command AND split parts
   - Add SECURITY NOTE header documenting parsing limitations
   - Add `never` exhaustiveness to matchRule() and formatRule()
   - Clear session rules when toggling yolo
   - Update /reset-rules message documenting ephemeral behavior

## Backlog

- [ ] Deduplicate rules before pushing

