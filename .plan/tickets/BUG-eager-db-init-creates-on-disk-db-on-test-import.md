<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: eager-db-init-creates-on-disk-db-on-test-import

**Status:** ✅ Resolved (already on dev, 2026-09-20)
**Priority:** Medium
**Effort:** Medium
**Summary:** Importing @/db eagerly creates loop-lore-data/loop-lore.db on disk during unit tests (2.2MB verified)
**Context:** Test-infra side effect — src/db/index.ts:73-78 IIFE, tests/setup-globals.ts preload
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

`src/db/index.ts:73-78` initializes a module-level `database` constant at
import time via an IIFE:

```
const database: Kysely<DB> = (() => {
  const dbPath = process.env.LOOP_LORE_DB_PATH ?? path.resolve(DATA_DIR, "loop-lore.db",);
  mkdirSync(path.dirname(dbPath,), { recursive: true, },);
  return new Kysely<DB>({ dialect: createDialect(dbPath,), },);
})();
```

`DATA_DIR` resolves to `<repo>/loop-lore-data`
(`src/config/constants.ts:13`), so importing `@/db` from any test:

1. `mkdirSync` creates the dir if missing.
2. `new Database(...)` opens/creates a SQLite file at
   `<repo>/loop-lore-data/loop-lore.db`.
3. `createDialect` applies WAL + FK pragmas, opening WAL/SHM sidecar files.

**Verified on disk after running `bun run test:unit`:**

```
$ ls loop-lore-data/
certs/  uploads/  loop-lore.db  loop-lore.db.bak
-rw-r--r-- 1 flak flak 2.2M loop-lore.db
-rw-r--r-- 1 flak flak 2.1M loop-lore.db.bak
```

A 2.2 MB SQLite DB was written into the repo by the test suite. The
general-purpose test path is supposed to be `:memory:`; this on-disk file
is unintentional side-effect of every test that imports `@/db` (almost all
of them).

The `testDatabaseOverride` mechanism in
`src/db/index.ts:80-99` overrides the *return value* of `getDatabase()`,
but the IIFE still creates the on-disk DB and holds a live Kysely handle
to it. That handle:

- Holds a file lock on `loop-lore-data/loop-lore.db`.
- Counts against `tests/setup-globals.ts`'s preload (which runs once per
  worker — see TASK-coverage-gate-true-multi-worker-fanout-investigation
  for an existing investigation of multi-worker contention on this file).
- Persists across test runs, leaving stale data in the repo.

The `tests/setup-globals.ts` preload reads from this on-disk DB; that is
WHY every test run writes to it. But the loader should resolve to a
process-scoped test DB (`:memory:` or `os.tmpdir()`), not the production
data path.

## Resolution

Already fixed in dev by `662ddfb14` (fix(db,test): lazy DB singleton + test-override hygiene). Verified 2026-09-20 against current dev (`609e5a45b`):

- `src/db/index.ts:90-108` — production `database` is now a lazy singleton; the IIFE is gone. `getDatabase()` initializes it on first call when no test override is set.
- `src/db/index.ts:75-88` — `setTestDatabase` JSDoc documents the parallel-safety contract (process-global under non-isolated runners, callers MUST clear).
- `tests/setup-globals.ts:14-18` — preload sets `LOOP_LORE_DB_PATH` to `os.tmpdir()` pid+time-stamped file before any import.
- `src/db/test-db-helpers.test.ts:84-109` — regression test asserts `getDatabase()` does not touch disk when an override is set.
- Verified on disk: after `bun test src/db/`, repo's `loop-lore-data/` contains only `certs/` and `uploads/` (no `loop-lore.db`).
- Cross-references: sibling tickets resolved in same commit: `BUG-create-test-db-custom-dialect-can-bypass-settestdatabase`, `BUG-settestdatabase-global-leak-on-test-throw`, `BUG-sqlite-foreign-keys-pragma-set-twice-redundant`, `BUG-sqlite-wal-pragma-noop-on-in-memory-test-db`, `BUG-test-run-id-uses-date-now-collision-risk-under-parallel`.

No code change required.


- [x] Make the production `database` IIFE lazy: only initialize on first
      `getDatabase()` call after `setTestDatabase` is *not* in effect
      (or always lazy, with explicit initialization in
      `src/server/start.ts`).
- [x] Update `tests/setup-globals.ts` to point `LOOP_LORE_DB_PATH` at an
      `os.tmpdir()`-based unique file (or `:memory:` if Kysely supports
      it in preload mode) before any other import.
- [x] Confirm `loop-lore-data/loop-lore.db` is no longer written during
      `bun run test:unit` (delete it, run tests, assert it was not
      recreated).
- [x] Confirm production startup (`bun run start`) still works.
- [x] `bun run check` passes.
- [x] Update `BUG-config-schema-defaults-leak-absolute-paths` cross-link
      if relevant (the on-disk DB path is part of that leak surface).

