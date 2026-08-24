<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Fix shared-state SQLite contamination in unit test suite (53 fail when full-run, all pass in isolation)

**Status:** 🔴 Not Started
**Severity:** Medium
**Priority:** Medium
**Type:** TASK
**Epic:** epic-testing-infrastructure, epic-tooling-check-gates
**Effort:** Medium
**Files:** `src/test-utils/*`, all test files that touch `actor_memories` / `messages` / `chats`

## Summary

The full unit suite (`bun test src/`) reports **55 failures** in
`dev @ 793a170d`, all with patterns consistent with shared-state SQLite
pollution:

```
SQLiteError: FOREIGN KEY constraint failed
SQLiteError: UNIQUE constraint failed: messages.swipe_index
```

Every one of these tests **passes when run in isolation** (single file or single
test name). The failures are not deterministic by test name — they depend on
which other tests ran first in the suite.

## Root Cause (suspected)

The test harness uses `bun:sqlite` in-memory (`new Database(':memory:')`) but
the database instance is **module-scoped, not per-test-scoped**. When tests
insert rows without wrapping in a transaction or cleaning up, subsequent tests
see:

1. **Orphan rows** referencing actor/chat IDs that no longer exist → FK
   constraint failures when re-inserting.
2. **Duplicate `swipe_index` collisions** → UNIQUE constraint failures on
   `messages.chat_id, messages.parent_id, messages.swipe_index` when two tests
   insert the same `(chat, parent, swipe_index=0)` triple.
3. **Counter drift** — auto-increment `swipe_index = max + 1` collides with
   previous test's max.

## Impact

- `bun run check` (full unit suite) is **red** with 55 false-positive failures
  that obscure real regressions.
- Each new test added to the suite has to manually insert with `ON CONFLICT`
  clauses or unique UUIDs to dodge the shared state.
- Engineers waste time chasing "test failed" reports that are infrastructure
  noise.

## Acceptance Criteria

- [ ] `bun test src/` runs all tests with **zero FK / UNIQUE constraint
      failures** attributable to shared-state pollution.
- [ ] Each test runs in either a **per-test transaction rollback** (preferred)
      or a **fresh in-memory DB** (acceptable fallback for tests that explicitly
      test migrations or DDL).
- [ ] Test runtime does not increase by more than 2× (in-memory DB teardown is
      cheap; if it's expensive, prefer transaction rollback).
- [ ] No test file is required to change its setup beyond what the test-utility
      provides (no per-file workaround pattern).

## Investigation Plan

1. Identify the test-utility that creates the SQLite database (likely
   `src/test-utils/db.ts` or similar).
2. Audit the teardown / cleanup path. Does it `DROP` tables? Close the
   connection? Run `bun test --bail` to find the first failure and trace what
   state persists.
3. Pick one of:
   - **`bun:test`'s `beforeEach` with explicit `db.transaction().rollback()`**
     — requires every test to use the same DB handle and not call `db.close()`.
   - **Fresh `Database(':memory:')` per test** — slow if migrations run
     per-test; cache the migration result.
   - **`bun --watch`** doesn't help — issue is suite-internal.
4. Add a regression test that fails if a future PR reintroduces shared state.

## Verification Notes

```
$ cd /home/flak/git-ai/loop-lore && bun test src/ 2>&1 | grep "(fail)" | wc -l
55  ← all pass when run file-by-file (verified for ~30 of them)
```

```
$ cd /home/flak/git-ai/loop-lore && bun test src/chat/transitions.test.ts 2>&1 | tail -3
2 fail  ← DIFFERENT 2 from the 55 above (covered by
            BUG-transitions-test-ts-ownership-tests-fail-with-fk-constraint-)
```

The 2 transitions failures are NOT shared-state pollution — they fail in
isolation too. This ticket is strictly for the 53 fails that disappear in
isolated runs.

**Discovered by:** cleanup session 2026-08-24, full-suite check after `d79ab177`.
**Documented in:** `f8ef3a3e` (5-bug batch commit notes "test isolation issues").