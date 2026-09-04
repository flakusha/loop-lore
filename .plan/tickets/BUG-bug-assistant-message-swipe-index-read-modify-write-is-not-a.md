# BUG: BUG: assistant message swipe-index read-modify-write is not atomic (race on unique index)

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/auto-gen/store-message.ts computes swipeIndex = max(swipe_index)+1 via a separate SELECT, then INSERTs. This read-modify-write is not wrapped in a transaction. Two concurrent assistant generations for the same parent collide on the unique (chat_id, parent_id, swipe_index) index and one INSERT fails. The user-message path uses insertUserMessageWithRetry/swipe-race-insert to handle this, but the assistant path does not. Fix: reuse the swipe-race-insert helper (conflict retry) or wrap in a transaction with a unique-constraint conflict handler.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing (existing 537 generation tests still green; no synthesized new test because storeMessage requires a full GenDeps harness that doesn't yet exist for direct unit testing)
- [ ] Documentation updated

## Resolution

Wrapped SELECT-MAX + INSERT in a `db.transaction().execute(...)` in `src/generation/auto-gen/store-message.ts`. The transaction body recomputes `max(swipe_index)+1` per attempt, INSERTs the assistant row, and on `UNIQUE constraint failed: messages.chat_id` or `SQLITE_CONSTRAINT idx_messages_swipe_unique` matches, bumps the candidate and retries up to 8 times — same atomicity discipline as `routes/messages/swipe-race-insert.ts` (`insertUserMessageWithRetry`). Non-UNIQUE errors (FK violation, encryption failure, DB down) are rethrown immediately so the real cause surfaces rather than being swallowed by retries. `bun run tsc --noEmit` clean; `bun test src/generation/` passes 537/537 (existing coverage includes the orchestrator-level happy path which exercises storeMessage indirectly).
