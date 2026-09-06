# BUG: SQLite pragmas skipped when dialect built from existing Database

**Status:** ✅ Resolved
**Priority:** medium
**Effort:** Medium

## Summary

src/db/index.ts:52-56 — WAL/foreign_keys pragmas only set in createDialect(path) path; callers passing existing Database to createSqliteDialect skip FK enforcement. Fix: move pragma setup into wrapper or document contract.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

db/index.ts createSqliteDialect now applies PRAGMA journal_mode=WAL + foreign_keys=ON on every Database — both file-path and existing-connection paths enforce FK. (resolved 2026-09-06)
