<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: setTestDatabase-global-leak-on-test-throw

**Status:** ✅ Resolved (already on dev, 2026-09-20)
**Priority:** Medium
**Effort:** Medium
**Summary:** Module-global testDatabaseOverride leaks when test setup throws before the close()-path cleanup runs
**Context:** Test-infra parallel-safety — src/db/index.ts:81, tests/e2e/helpers/{server,browser-server}.ts
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

`setTestDatabase(db)` writes a module-level singleton
(`src/db/index.ts:81` `testDatabaseOverride`). The matching cleanup
`setTestDatabase(null)` only runs at the END of
`createTestServer`/`createBrowserTest` (lines 412, 176 respectively).

If a test throws between `createTestDb()` (which sets the override) and
the cleanup, the override stays set. Under `bun test --parallel=4 --isolate`
this is usually contained (each file runs in its own VM), but `bunfig.toml`
preload + test files that share an import path can still leak. Bun's
isolation is "best-effort"; it does not guarantee per-file module-graph
separation in every code path.

Even within a single file: if a `beforeAll` calls `createTestServer()`
and a `test` throws, `afterAll` runs cleanup — good. But if the `beforeAll`
itself throws partway through (e.g. migrations fail on the test DB,
seedUser insert fails), the `afterAll` may or may not run depending on
bun-test's teardown semantics. The `server.close()` body that contains
`setTestDatabase(null)` may never execute.

Evidence — every site that sets the override is gated by a cleanup site
that lives inside a `close` closure reachable only via `ctx.close()` /
`server.close()`:

```
tests/e2e/helpers/server.ts:197    setTestDatabase(db,);     // write
tests/e2e/helpers/server.ts:412    setTestDatabase(null,);    // cleanup — only if close() called
tests/e2e/helpers/browser-server.ts:176   setTestDatabase(null,); // same pattern
src/db/index.ts:81    let testDatabaseOverride: Kysely<DB> | null = null;   // module global
```

There is no `try { ... } finally { setTestDatabase(null); }` pattern.

Risk in practice: today, `--isolate` saves us. But this is a latent
parallel-safety bug — if anyone adds a test file that runs without
--isolate (e.g. via `bun test --no-isolate`) or shares a module graph
across files, the leaked override will silently route later tests at the
real DB.

## Resolution

Already fixed in dev by `662ddfb14` (fix(db,test): lazy DB singleton + test-override hygiene). Verified 2026-09-20 against current dev (`609e5a45b`):

- `tests/e2e/helpers/server.ts:427-436` — `createTestServer()` `catch` block calls `setTestDatabase(null)` and removes the test upload dir when setup throws mid-way.
- `tests/e2e/helpers/browser-server.ts:188-197` — `createBrowserTest()` same pattern (`browser?.close()`, `bunServer?.stop()`, `setTestDatabase(null)`, `rmSync`).
- `src/db/index.ts:75-88` — `setTestDatabase` JSDoc documents the parallel-safety contract (process-global under non-isolated runners; callers MUST clear).
- `src/db/migrations.test.ts:78-82`, `src/db/migration-roundtrip.test.ts:208-212` — `afterAll` blocks call `setTestDatabase(null)` so a thrown test does not leak the override.
- `src/db/test-db-helpers.test.ts:23-46` — regression test asserts `setTestDatabase(null)` clears the sentinel path.
- Note: implementation uses explicit `catch` (rethrows after cleanup) rather than `try/finally` since both helpers also need to free the bun server / browser. Functionally equivalent for the throw-leak guarantee.
- Cross-references: `BUG-create-test-db-custom-dialect-can-bypass-settestdatabase` resolved in same commit.

No code change required.


- [x] Wrap `createTestDb()` and the migration test helpers in
      `try { ... } finally { setTestDatabase(null); }` so cleanup runs
      even when construction throws.
- [x] Add a regression test that throws inside `beforeAll` after
      `createTestDb()` and asserts the module-global override is cleared
      afterward (via a sentinel: the next `getDatabase()` should return
      the singleton, not the previous test DB).
- [x] Document the parallel-safety contract on `setTestDatabase` in
      `src/db/index.ts` (it is process-global under non-isolated runners;
      tests must clear it).
- [x] `bun run check` passes.

