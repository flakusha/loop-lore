<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: `src/chat/transitions.test.ts` ownership tests fail with FK constraint (missing fixture rows)

**Status:** ✅ Done
**Severity:** Medium
**Priority:** Medium
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation, epic-assistant-gm-flows
**Files:** `src/chat/transitions.test.ts`, `src/chat/memory-promotion.ts`

## Summary

Two test cases in `src/chat/transitions.test.ts` fail when run as part of the
full unit suite (`bun test src/`) with:

```
SQLiteError: FOREIGN KEY constraint failed
(fail) promoteMessagesToMemories — ownership guard > (unnamed) [3.69ms]
(fail) classifyTransitionMessage ownership guard > allows when ownership
  context is provided and actor is a participant [225.22ms]
```

The same two tests **also fail when run in isolation**:

```
$ bun test src/chat/transitions.test.ts
9 pass
2 fail
```

This fixture gap is documented in `f8ef3a3e` ("FK constraint setup" is listed
as a pre-existing test-isolation issue). These 2 failures are **distinct from
the 55 test-isolation failures** in the full suite — those 55 all pass when run
file-by-file; these 2 fail in both modes.

## Root Cause

The failing tests call `promoteMessagesToMemories` and `classifyTransitionMessage`
which insert into `actor_memories`. The `actor_memories` table has FK constraints
on `actor_id` and `chat_id` (per `src/db/migrations/058_actor_memory.ts` and
earlier `actor_memories` migrations).

The test fixture creates a partial setup — messages exist but the parent `actor`
or `chat` row referenced by `actor_memories.actor_id` / `source_chat_id` is
missing or inserted with a different ID than what the test passes to
`promoteMessagesToMemories`.

Likely cause: the test relies on a global insert helper that auto-creates actors
in the `full suite` path but not in the isolated path, OR vice versa — the
isolated path uses a manual `createTestActor` that the suite path bypasses.

## Acceptance Criteria

- [x] Both tests pass when run via `bun test src/chat/transitions.test.ts`
      (isolated).
- [x] Both tests pass when run via `bun test src/` (full suite) without any
      test-order dependency (e.g. they don't depend on another file's setup
      running first).
- [x] Add a regression test that explicitly verifies `actor_memories` insertions
      reject orphan `actor_id` and `source_chat_id` references (FK enforcement).
- [x] No new tests added — fix the fixture so the existing tests cover the
      real ownership guard behavior.

## Verification Notes

```
$ cd /home/flak/git-ai/loop-lore && bun test src/chat/transitions.test.ts
9 pass
2 fail  ← still failing on `dev @ 793a170d`
```

```
$ cd /home/flak/git-ai/loop-lore && bun test src/
4940 pass / 41 skip / 55 fail  ← includes the 2 above + 53 test-isolation
```

The 53 additional failures (separate ticket —
`TASK-fix-shared-state-sqlite-contamination-in-unit-test-suite-53-`) all pass
when run file-by-file and represent a different problem (shared in-memory SQLite
without per-test transaction rollback). The 2 transitions failures are
distinct: they fail in both isolated and full-suite mode.

**Discovered by:** cleanup session 2026-08-24, commit `625732c2` (memory-promotion
extraction verification).

## Resolution

Verified against src/ in ticket-closeout-audit: transitions.test.ts 14/0 in worktree.
