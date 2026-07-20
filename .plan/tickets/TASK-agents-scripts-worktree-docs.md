# TASK: AGENTS.md + .agents Updates for scripts/ Worktree Management

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Low

## Summary

Update `AGENTS.md` and `.agents/` files to properly document `scripts/worktree.sh` usage for worktree management.

## Current State

- `AGENTS.md` has extensive worktree documentation (GPG signing, worktree commands)
- `scripts/worktree.sh` handles full lifecycle: create, merge, rebase, finalize
- `.agents/skills/worktree-merge/SKILL.md` covers merge/rebase operations
- Missing: documentation for new functionalities, troubleshooting, edge cases

## Tasks

### AGENTS.md Updates

- [ ] Add section on `scripts/worktree.sh` command reference
- [ ] Document all worktree commands with examples:
  - `new <branch> [base]` — create branch + worktree
  - `create <branch>` — create worktree for existing branch
  - `merge <branch> <source>` — merge source into branch
  - `rebase <branch> [onto]` — rebase onto target
  - `finalize <branch>` — validate + merge to master + remove worktree
  - `agent-merge <branch>` — alias for finalize
  - `ticket <type> <id> "<title>"` — create ticket + worktree
  - `issues` — list open issues
  - `list` — show active worktrees
  - `cleanup` — remove stale worktrees
  - `remove <branch>` — remove specific worktree
  - `sign <branch>` — configure GPG signing
- [ ] Add troubleshooting section for common issues:
  - Dirty worktree errors
  - GPG signing failures
  - Merge conflicts
  - Protected branch violations
- [ ] Update examples with real use cases

### .agents/ Updates

- [ ] Review `.agents/skills/worktree-merge/SKILL.md` for completeness
- [ ] Add any missing edge cases or troubleshooting
- [ ] Ensure skill description matches actual script capabilities

### Scripts Updates

- [ ] Review `scripts/worktree.sh` for missing functionalities
- [ ] Add `--help` flag documentation
- [ ] Add `status` command (branch ahead/behind master)
- [ ] Add `diff` command (show changes since master)
- [ ] Improve error messages for common failures

## Files to Modify

- `AGENTS.md` — add worktree command reference
- `.agents/skills/worktree-merge/SKILL.md` — update skill documentation
- `scripts/worktree.sh` — add missing commands/documentation

## Success Criteria

- [ ] All worktree commands documented with examples
- [ ] Troubleshooting guide covers common issues
- [ ] Script has `--help` output
- [ ] No stale or incorrect documentation

## Risk

Low — documentation-only changes, no functional impact.
