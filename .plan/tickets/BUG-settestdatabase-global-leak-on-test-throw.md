<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: setTestDatabase-global-leak-on-test-throw

**Status:** ⬜ Not Started
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

## Acceptance Criteria

- [ ] Wrap `createTestDb()` and the migration test helpers in
      `try { ... } finally { setTestDatabase(null); }` so cleanup runs
      even when construction throws.
- [ ] Add a regression test that throws inside `beforeAll` after
      `createTestDb()` and asserts the module-global override is cleared
      afterward (via a sentinel: the next `getDatabase()` should return
      the singleton, not the previous test DB).
- [ ] Document the parallel-safety contract on `setTestDatabase` in
      `src/db/index.ts` (it is process-global under non-isolated runners;
      tests must clear it).
- [ ] `bun run check` passes.

