<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: eager-db-init-creates-on-disk-db-on-test-import

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

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

## Acceptance Criteria

- [ ] Make the production `database` IIFE lazy: only initialize on first
      `getDatabase()` call after `setTestDatabase` is *not* in effect
      (or always lazy, with explicit initialization in
      `src/server/start.ts`).
- [ ] Update `tests/setup-globals.ts` to point `LOOP_LORE_DB_PATH` at an
      `os.tmpdir()`-based unique file (or `:memory:` if Kysely supports
      it in preload mode) before any other import.
- [ ] Confirm `loop-lore-data/loop-lore.db` is no longer written during
      `bun run test:unit` (delete it, run tests, assert it was not
      recreated).
- [ ] Confirm production startup (`bun run start`) still works.
- [ ] `bun run check` passes.
- [ ] Update `BUG-config-schema-defaults-leak-absolute-paths` cross-link
      if relevant (the on-disk DB path is part of that leak surface).

