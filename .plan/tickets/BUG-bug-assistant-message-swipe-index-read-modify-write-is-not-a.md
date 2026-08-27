# BUG: BUG: assistant message swipe-index read-modify-write is not atomic (race on unique index)

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/generation/auto-gen/store-message.ts computes swipeIndex = max(swipe_index)+1 via a separate SELECT, then INSERTs. This read-modify-write is not wrapped in a transaction. Two concurrent assistant generations for the same parent collide on the unique (chat_id, parent_id, swipe_index) index and one INSERT fails. The user-message path uses insertUserMessageWithRetry/swipe-race-insert to handle this, but the assistant path does not. Fix: reuse the swipe-race-insert helper (conflict retry) or wrap in a transaction with a unique-constraint conflict handler.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
