# BUG: Factory reset deletes tables without transaction, silent per-table catch

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

src/routes/admin/danger-zone.ts:143-151 — factory reset deletes tables one-by-one with silent catch and no transaction; mid-failure yields half-wiped DB and hides which table failed. Also :146 deleteFrom(table as any) defeats Kysely typing — typo'd table name compiles then throws into silent catch. Fix: single transaction, propagate errors, typed table union.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
