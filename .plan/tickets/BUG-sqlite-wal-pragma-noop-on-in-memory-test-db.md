<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: sqlite-wal-pragma-noop-on-in-memory-test-db

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

`tests/e2e/helpers/server.ts:182-187` runs `PRAGMA journal_mode = WAL` on an
**in-memory** `:memory:` SQLite database. WAL requires a file-backed database;
SQLite silently accepts the pragma on `:memory:` and returns the existing
journal mode without error. The pragma is a dead call that gives a false
sense of test coverage — code reading these pragmas might assume the test DB
has WAL semantics when it does not.

Worse: `src/db/index.ts:35-36` (`createSqliteDialect`) re-runs the same
pragmas on every Database handle that passes through it, so the explicit
pragma in `server.ts:184` is fully redundant for any DB that goes through
`createSqliteDialect` (the default `sqliteInMemory()` path) AND it is
duplicated dead code for any custom dialect factory that doesn't pass
through `createSqliteDialect`.

Evidence:

```
tests/e2e/helpers/server.ts:182-187
  function sqliteInMemory(): Dialect {
    const sqlite = new Database(":memory:",);
    sqlite.run("PRAGMA journal_mode = WAL",);  // <-- no-op on :memory:
    sqlite.run("PRAGMA foreign_keys = ON",);
    return createSqliteDialect(sqlite,);
  }

src/db/index.ts:30-36
  export function createSqliteDialect(database: Database,): SqliteDialect {
    // Always enforce WAL + foreign keys on the underlying connection, whether
    // the caller passed a fresh file path or an existing Database.
    database.run("PRAGMA journal_mode = WAL",);
    database.run("PRAGMA foreign_keys = ON",);
```

SQLite reference: WAL mode returns SQLITE_OK on `:memory:` but does not
enable WAL; the journal_mode remains `MEMORY` for in-memory databases.

## Acceptance Criteria

- [ ] Remove `sqlite.run("PRAGMA journal_mode = WAL",)` from
      `tests/e2e/helpers/server.ts:184` — `:memory:` cannot use WAL, and
      `createSqliteDialect` already enforces it on the file-backed path.
- [ ] Keep `PRAGMA foreign_keys = ON` (or rely solely on `createSqliteDialect`
      to enforce it; confirm FK enforcement is verified by the in-memory test
      suite).
- [ ] Add a regression test that asserts the in-memory DB has
      `journal_mode = memory`, not `wal`, to lock in the no-op assumption so
      future refactors don't silently enable a different journal mode on the
      test path.
- [ ] `bun run check` passes.
