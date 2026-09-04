# BUG: Batch chat delete lacks transaction — orphaned rows on partial failure

**Status:** ✅ Resolved (already on dev, 2026-09-04)
**Priority:** medium
**Effort:** Medium

## Summary

src/chat/service/batch.ts:56-64 — batch delete of 7 child tables + chats not wrapped in .transaction(); partial failure leaves orphaned messages/participants. Fix: wrap loop in database.transaction().

## Resolution

Already fixed in dev by `154a25ab` (fix(chat): wrap batchDeleteChats in a single transaction). Verified 2026-09-04 against current `dev` (`7c76aed4`):

- `src/chat/service/batch.ts` — `batchDeleteChats` is now wrapped in `database.transaction().execute(...)`, so partial failure rolls back instead of orphaning child rows.

No code change required.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
