# TASK: deleteChat runs 9 sequential deletes without transaction (orphan risk)

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/chat/service/crud/delete.ts:13-42 deletes 9 child tables with separate awaits and no db.transaction; mid-failure leaves partial delete or orphaned rows and signals missing ON DELETE CASCADE. Fix: wrap whole cascade in db.transaction().execute(). Tracked in .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
