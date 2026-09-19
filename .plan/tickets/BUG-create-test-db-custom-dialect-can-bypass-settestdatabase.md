<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: create-test-db-custom-dialect-can-bypass-setTestDatabase

**Status:** ✅ Resolved (already on dev, 2026-09-20)
**Priority:** Medium
**Effort:** Medium
**Summary:** Migration/roundtrip tests create raw Database handles without setTestDatabase — getDatabase() resolves the real on-disk DB
**Context:** Test isolation — src/db/migrations.test.ts:51, src/db/migration-roundtrip.test.ts:62, src/db/schema-manifest.ts
**Acceptance Criteria:** See ## Acceptance Criteria below.

`src/db/migrations.test.ts` (line 51), `src/db/migration-roundtrip.test.ts`
(line 62), and `src/db/schema-manifest.ts` create `Database` handles
directly without calling `setTestDatabase(...)`. These handles are used by
the test code itself but are NOT propagated to production code that calls
`getDatabase()` to obtain the active DB handle.

Concrete consequence: any production code path that calls `getDatabase()`
during a migration test will receive the **production eager-init DB**
(see BUG-eager-db-init-creates-on-disk-db-on-test-import) at
`loop-lore-data/loop-lore.db`, NOT the test DB. The migration under test
runs against the `:memory:` test DB, but migration-runner code that resolves
the active handle via `getDatabase()` reads/writes the real on-disk DB.

Evidence:

```
src/db/migrations.test.ts:48-55
  function createTestKysely(): { db: Kysely<DB>; db2: Database } {
    const db = new Database(":memory:",);
    db.run("PRAGMA foreign_keys = ON",);
    const dialect = createSqliteDialect(db,);
    const kysely = new Kysely({ dialect, },);
    return { db, db2: db, };
  }
  // NOTE: no setTestDatabase(kysely) call

src/db/migration-roundtrip.test.ts:58-66
  function createTestDb(): { db: Kysely<DB>; sqlite: Database } {
    const sqlite = new Database(":memory:",);
    sqlite.run("PRAGMA foreign_keys = ON",);
    const dialect = createSqliteDialect(sqlite,);
    const db = new Kysely({ dialect, },);
    return { db, sqlite, };
  }
  // NOTE: no setTestDatabase(db) call
```

`src/db/migrate.ts:134` accepts the DB as a parameter, so `runMigrations(db)`
is safe — but `src/db/migrate.ts:165-167` (CLI entry) calls `getDatabase()`
unconditionally. If a test ever invokes the CLI entry, or if a migration's
`up`/`down` callback uses `getDatabase()` instead of the parameter, the test
silently operates on the real on-disk DB.

Risk is amplified by `src/db/migrations/README.md`'s append-only policy:
bugs in this path can corrupt the production DB before any review.

## Resolution

Already fixed in dev by `662ddfb14` (fix(db,test): lazy DB singleton + test-override hygiene). Verified 2026-09-20 against current dev (`609e5a45b`):

- `src/db/migrations.test.ts:58-64` — `createTestKysely()` now calls `setTestDatabase(kysely)` so any `getDatabase()` resolution inside a migration callback hits the test DB.
- `src/db/migration-roundtrip.test.ts:69-75` — `createFreshDb()` (the roundtrip helper's per-test factory) calls `setTestDatabase(db)`.
- `tests/e2e/helpers/server.ts:194-201` — `createTestDb()` registers the override; `tests/e2e/helpers/browser-server.ts:88` does the same.
- `src/db/migrations.test.ts:78-82`, `src/db/migration-roundtrip.test.ts:208-212` — `afterAll` blocks call `setTestDatabase(null)`.
- `src/db/test-db-helpers.test.ts:23-46` — regression tests assert override set/clear sentinel path.
- Cross-references: `BUG-settestdatabase-global-leak-on-test-throw` resolved in same commit (cleanup on throw).

No code change required.


- [x] Add `setTestDatabase(db)` to `createTestKysely()` in
      `src/db/migrations.test.ts` (around line 54) so the test DB is the
      active handle for any code path resolving via `getDatabase()`.
- [x] Same for `createTestDb()` in `src/db/migration-roundtrip.test.ts`
      (around line 65).
- [x] Add a `beforeAll`/`afterAll` pair (or equivalent) that calls
      `setTestDatabase(null)` to clear the override after each test, even
      if the test throws — preventing leak into sibling files when
      `--isolate` is not strict enough.
- [x] Confirm `bun run test:unit` passes with no regression, and that
      `loop-lore-data/loop-lore.db` is no longer written during test runs
      that don't intend to touch it.
