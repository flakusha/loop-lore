# BUG: SQLite FK pragma no-op in migration 047 rebuild

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/db/migrations/047_user_role_expansion.ts:31 — PRAGMA foreign_keys = OFF runs inside Kysely per-migration transaction; SQLite ignores FK pragma mid-transaction, so table rebuild either fails under FK enforcement or assumes false safety. Fix: set transaction:false on migration and re-enable pragma in finally block.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
