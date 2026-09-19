<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: sqlite-foreign-keys-pragma-set-twice-redundant

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

`PRAGMA foreign_keys = ON` is set in three places for test DBs:

1. `src/db/index.ts:36` (`createSqliteDialect`) — runs on every Database
   that passes through the helper.
2. `src/db/migrations.test.ts:52` — sets it before calling
   `createSqliteDialect`, which then re-runs the same pragma.
3. `src/db/migration-roundtrip.test.ts:63` — same as #2.

Evidence:

```
src/db/migrations.test.ts:48-55
  function createTestKysely(): { db: Kysely<DB>; db2: Database } {
    const db = new Database(":memory:",);
    db.run("PRAGMA foreign_keys = ON",);   // <-- redundant
    const dialect = createSqliteDialect(db,);   // runs it again at src/db/index.ts:36
    ...
  }

src/db/migration-roundtrip.test.ts:58-66
  function createTestDb(): { db: Kysely<DB>; sqlite: Database } {
    const sqlite = new Database(":memory:",);
    sqlite.run("PRAGMA foreign_keys = ON",);   // <-- redundant
    const dialect = createSqliteDialect(sqlite,);   // runs it again
    ...
  }
```

Impact is low (pragma is idempotent) but it teaches a wrong pattern:
callers believe they must enable FK explicitly. The single source of truth
should be `createSqliteDialect`. The duplicate calls also hide the fact
that the helper is the load-bearing enforcement point — if someone refactors
out the pragma in the helper, the tests will still appear to "enable FK".


## Acceptance Criteria

- [ ] Remove `db.run("PRAGMA foreign_keys = ON",)` from
      `src/db/migrations.test.ts:52` and `src/db/migration-roundtrip.test.ts:63`
      — `createSqliteDialect` enforces it.
- [ ] Add a comment at the top of `createTestKysely()` /
      `createTestDb()` clarifying that FK enforcement comes from
      `createSqliteDialect` (not local pragmas).
- [ ] Confirm FK enforcement still works on the test DB by running the
      existing FK cascade test in `src/db/migrations.test.ts:325` (delete
      user → actor → activitypub_actor_key chain assertion).
- [ ] `bun run test:unit` passes with no regression.

