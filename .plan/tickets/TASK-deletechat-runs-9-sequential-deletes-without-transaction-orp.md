# TASK: deleteChat runs 9 sequential deletes without transaction (orphan risk)

**Status:** ✅ Implemented (chat-bugfix-batch-1)
**Priority:** high
**Effort:** Medium

## Summary

src/chat/service/crud/delete.ts:13-42 deletes 9 child tables with separate awaits and no db.transaction; mid-failure leaves partial delete or orphaned rows and signals missing ON DELETE CASCADE. Fix: wrap whole cascade in db.transaction().execute(). Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated

## Resolution

Implemented in branch `chat-bugfix-batch-1` (commit pending).

`src/chat/service/crud/delete.ts` rewrites `deleteChat` to wrap the nine child-table
deletes + the final `chats` row deletion in a single `db.transaction().execute((trx) => { ... })`.
Each `database.deleteFrom(...)` became `trx.deleteFrom(...)`; the inner world-states delete's
subqueries now run against `trx.selectFrom(...)` instead of the outer `database`. The
function still returns `Promise<void>` and the outer API is unchanged.

Tests added in `src/chat/service/crud/delete.test.ts`:
- happy path: every child table row (chats, chat_participants, messages, story_turns,
  asset_links, world_states) is wiped
- unrelated chat rows survive the cascade
- deleting a chat with no related rows resolves without error
- mid-cascade failure rolls back every prior delete (atomicity): a stubbed `db` whose
  `deleteFrom('messages')` throws proves the transaction wrapper keeps `chats`,
  `chat_participants`, and the seeded `messages` row intact.

Documentation update deferred — `src/chat/service/crud/README.md` does not exist; the
JSDoc on `deleteChat` now describes the transaction semantics inline.
