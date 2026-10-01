<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FIX: add jitter to the finalize lock retry backoff

**Summary:** acquireFinalizeLock retries 50 times with a fixed 20ms sleep (scripts/worktree/commands/finalize.ts:199-204):
**Context:** (none captured)
**Acceptance Criteria:** Implementation complete, tests passing, documentation updated.

**Status:** Done
**Priority:** medium
**Effort:** Small

**Summary:**

acquireFinalizeLock retries 50 times with a fixed 20ms sleep (scripts/worktree/commands/finalize.ts:199-204):

    for (let attempt = 0; attempt < 50; attempt++) {
      if (tryCreate()) { return release; }
      if (reapStale()) { return release; }
      // Brief backoff before retry. 50 x 20ms = 1s ceiling.
      Bun.sleepSync(20,);
    }

A fixed interval makes contending processes retry in lockstep: every collision window is identical, so contenders re-collide at the same instants instead of spreading out. The lock is held for the whole merge sequence, and this repo has multiple worktrees finalizing into dev concurrently, so the herd is real and the 1s ceiling is routinely exhausted by the winner.

Sibling: the same fixed-20ms pattern exists in giwt upstream (src/commands/finalize.ts:279-284) and is filed there as giwt issue 7860800. Fixing only one side leaves the divergence the fork-retirement migration tracks (c6f5f7868).


Evidence: scripts/worktree/commands/finalize.ts:199-204. Upstream twin: giwt/src/commands/finalize.ts:279-284.

## Acceptance Criteria

- [x] The retry sleep is randomized rather than a fixed 20ms
- [x] The total acquisition ceiling stays at 1s (50 attempts)
- [x] The ESRCH-only stale reap is preserved — EPERM must still respect a live lock
- [x] A test asserts two contenders acquiring the same lock do not retry in lockstep


## Resolution (2026-09-29)

`lockRetryDelayMs()` (full jitter over `[0, 20ms]`) replaces the fixed
`Bun.sleepSync(20)`; `LOCK_RETRY_ATTEMPTS` stays 50, so the worst case is
unchanged at ≤1s. The stale-reap block is untouched — it still distinguishes
ESRCH from EPERM.

Tests in `finalize-lock-cleanup.test.ts`:

- 200 draws are bounded in `[0, 20)` and not constant.
- Two contender schedules (50 draws each) differ, and their combined worst
  case stays within 50 × 20ms per contender.

`bun test scripts/worktree/` green.

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (`docs/giwt-scripts-map.md` try-8)


## Verification Notes (2026-10-01)

Re-verified against `dev` before closing — the work was real and committed, not
lost. Commit `f28c3ca24` ("fix(worktree): isolate git env, harden finalize/rebase
targets") landed both this jitter fix and the sibling isolated-env fix on `dev`.

- `lockRetryDelayMs()` is exported at `scripts/worktree/commands/finalize.ts:141`
  and is the sleep at `:233`; `LOCK_RETRY_ATTEMPTS` is still 50, so the 1s ceiling
  is unchanged.
- `bun test scripts/worktree/finalize-lock-cleanup.test.ts` → 8 pass / 0 fail.
- Mutation check: returning a constant `LOCK_RETRY_MAX_MS` (i.e. the pre-fix
  fixed interval) turns that into **6 pass / 2 fail** — "draws a bounded,
  non-constant delay" and "de-phases two contenders instead of retrying in
  lockstep" both fail. The tests are load-bearing, not self-skipping.

The stale part was only the `Status:` line — the Resolution heading also said
"uncommitted", which had been wrong since `f28c3ca24`. Heading corrected.
## Resolution (2026-09-29)

`lockRetryDelayMs()` (full jitter over `[0, 20ms]`) replaces the fixed
`Bun.sleepSync(20)`; `LOCK_RETRY_ATTEMPTS` stays 50, so the worst case is
unchanged at ≤1s. The stale-reap block is untouched — it still distinguishes
ESRCH from EPERM.

Tests in `finalize-lock-cleanup.test.ts`:

- 200 draws are bounded in `[0, 20)` and not constant.
- Two contender schedules (50 draws each) differ, and their combined worst
  case stays within 50 × 20ms per contender.

`bun test scripts/worktree/` green.

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated (`docs/giwt-scripts-map.md` try-8)
