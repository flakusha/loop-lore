# BUG: Batch chat delete lacks transaction — orphaned rows on partial failure

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

src/chat/service/batch.ts:56-64 — batch delete of 7 child tables + chats not wrapped in .transaction(); partial failure leaves orphaned messages/participants. Fix: wrap loop in database.transaction().

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
