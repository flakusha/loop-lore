<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Audit follow-up: worktree finalize reapStale() void dead code

**Status:** ✅ Done — verified stale (no code change required)
**Priority:** low
**Effort:** Medium

## Summary

Audit found 7aa33f8b added `void reapStale()` in scripts/worktree/commands/finalize.ts but never captures return or awaits; the surrounding function returns before reap completes. Either await reapStale() or remove the void wrapper. See audit .tmp/audit/batch-B-config-size.md finding MEDIUM.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution (2026-09-03)

Verified stale — no code change required. The ticket describes a code state that does not exist in `scripts/worktree/commands/finalize.ts`:

- Line 140 (inside `acquireFinalizeLock`) is `if (reapStale()) { return release; }` — the return value is captured
  and used as the loop-termination / lock-acquired signal. There is NO `void reapStale()` wrapper anywhere in the file.
- `reapStale()` is declared at line 105 inside `acquireFinalizeLock`, returns `boolean`, and is called
  synchronously from the lock-acquisition retry loop on line 140. The boolean is consumed (`if`) rather than discarded.
- This is the correct usage: the function reaps a stale lockfile by deleting it and retrying `tryCreate`,
  returning `true` only when the reaped-and-recreated path succeeded. There is no async work to await
  — `reapStale` is fully synchronous, so `void reapStale()` would be a code smell.
- The audit's reference commit `7aa33f8b` was either reverted or never introduced the alleged pattern.
  `rtk grep -n "void reapStale" scripts/worktree` returns zero matches.
- Conclusion: ticket describes an antipattern that is not present; the actual call site already does
  the right thing. No action required.
