# BUG: Worktree ticket writes plan files to main checkout

**Status:** ✅ Closed — duplicate of `BUG-scripts-worktree-ticket-writes-to-cwd-instead-of-worktree-pa` (issue 81dc8f9); root-cause analysis posted there (2026-08-31)
**Priority:** medium
**Effort:** low

## Summary

## Problem

`scripts/worktree/ ticket` always writes `.plan/tickets/<ID>.md` into the MAIN checkout even when invoked with cwd inside `tree/<branch>` — the ticket never lands on the worktree branch, dirtying the (read-only) dev working tree and blocking `agent-commit` in the worktree (files must be moved manually).

## Root cause

- `scripts/worktree/utils/config.ts:45-50` — `loadConfig()` sets `repoRoot = findRepoRoot()`, deliberately resolving the main worktree root.
- `scripts/worktree/commands/ticket.ts:56-60` — `ticketPath = resolve(config.repoRoot, ".plan/tickets/...")` with no branch/cwd awareness.

Contrast: `git rev-parse --show-toplevel` inside a linked worktree already returns that worktree's path — the resolution exists, it is just overridden by the main-root choice.

## Expected

When invoked inside a linked worktree, write the ticket file relative to that worktree (toplevel of cwd); keep main-checkout behavior when invoked from the main root; add an explicit `--repo-root` override for CI. `plan:sync` in the worktree then finds the file and links the shared git-issue ref.

## Reproduce

1. `bun run scripts/worktree/ new some-branch`; 2. `cd tree/some-branch`; 3. `bun run scripts/worktree/ ticket TASK "demo" "body"`; 4. observe file created at `<main>/.plan/tickets/TASK-demo.md`, absent from the worktree.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
