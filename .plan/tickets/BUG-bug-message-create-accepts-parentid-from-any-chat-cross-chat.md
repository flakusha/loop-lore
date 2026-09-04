# BUG: BUG: message create accepts parentId from any chat (cross-chat parent coupling)

**Status:** ✅ Done
**Priority:** medium
**Effort:** Medium

## Summary

src/routes/messages/create.ts sets parentId = body.parentId ?? null and passes it straight to insertUserMessageWithRetry with no check that the parent message belongs to chatId. A user who can access chat A can set parentId to a message id from chat B, coupling the new message under a foreign chat thread. checkChatAccess verifies chat A membership but not parent ownership. Fix: when parentId is provided, verify the parent message exists and its chat_id === chatId (404/403 otherwise).

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [ ] Documentation updated

## Resolution

Wrapped the parent-check + INSERT in a single `db.transaction().execute(...)` block in `src/routes/messages/create.ts`. Inside the transaction, if `parentId !== null`, a SELECT against `messages` returns the parent's `chat_id`; missing parent → 404 (`ParentMessageNotFoundError`), parent from another chat → 403 (`ParentMessageNotInChatError`). Both errors throw inside the transaction (rolled back, no row inserted) and are mapped to their HTTP responses in the surrounding catch. New sentinel error classes exported from the same module. Added `__tests__/cross-chat-parent-idor.test.ts` (4 cases: same-chat positive, cross-chat → 403, missing → 404, null parentId root insert). Negative paths assert no row inserted via `SELECT COUNT(*) WHERE id = ?`. `bun run tsc --noEmit` clean; `bun test` passes 4/4.
