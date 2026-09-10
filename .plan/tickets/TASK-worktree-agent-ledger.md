# TASK: feat(worktree): agent ledger and finalize failure reporting

**Status:** ✅ Finished (2026-09-10)
git issue: 23aec201d
**Priority:** medium
**Tags:** ["worktree", "ledger", "agent"]

## Summary

3-commit cluster adding agent commit ledger, finalize failure grievance reporting (`gripe`), and the `ledger` / `gripe` commands. Commit outcomes are dispatched to the ledger; finalize reports failures via `gripe`; agent ledger persists outcomes.

## Implementation

- `scripts/worktree/commands/agent-commit.ts` — dispatch commit outcomes to ledger
- `scripts/worktree/commands/commit.ts` — ledger dispatch on commit
- `scripts/worktree/commands/gripe.ts` — failure grievance command
- `scripts/worktree/commands/gripe.test.ts` — grievance command tests
- `scripts/worktree/commands/ledger.ts` — ledger query command
- `scripts/worktree/utils/ledger.ts` — ledger data structure and operations
- `scripts/worktree/utils/ledger.test.ts` — ledger utility tests
- `scripts/worktree/commands/finalize.ts` — call `gripe` on finalize failure

## Commits

- `23aec201d` feat(worktree): agent ledger, ledger/gripe commands
- `7e562082a` feat(worktree): gripe on finalize failure
- `bec0c1995` feat(worktree): dispatch commit outcomes to ledger

## Acceptance Criteria

- [x] Commit outcomes dispatched to ledger
- [x] Finalize failure triggers `gripe` report
- [x] `ledger` command shows commit outcomes
- [x] `gripe` command reports finalize failures
- [x] Ledger tests passing

## Resolution

Landed on dev `2026-09-10`. Ledger + gripe tests pass.
