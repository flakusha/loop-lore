# BUG: Factory reset deletes tables without transaction, silent per-table catch

**Status:** ✅ Resolved
**Priority:** high
**Effort:** Medium

## Summary

src/routes/admin/danger-zone.ts:143-151 — factory reset deletes tables one-by-one with silent catch and no transaction; mid-failure yields half-wiped DB and hides which table failed. Also :146 deleteFrom(table as any) defeats Kysely typing — typo'd table name compiles then throws into silent catch. Fix: single transaction, propagate errors, typed table union.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

Already fixed on dev: src/routes/admin/danger-zone.ts factory-reset wraps the per-table deletes in db.transaction() over a typed TABLE_LIST, propagates errors to a 500 with logged cause; no silent per-table catch. (resolved 2026-09-06)
