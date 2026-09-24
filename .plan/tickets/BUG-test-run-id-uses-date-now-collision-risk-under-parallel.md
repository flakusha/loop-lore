<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: test-run-id-uses-Date-now-collision-risk-under-parallel

**Status:** done
**Priority:** Medium
**Effort:** Medium
**Summary:** e2e testRunId uses Date.now()+Math.random() — collision under parallel workers shares/deletes upload dirs
**Context:** Test-infra parallel-safety — tests/e2e/helpers/server.ts:353, tests/e2e/helpers/browser-server.ts:88
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

`tests/e2e/helpers/server.ts:353` and `tests/e2e/helpers/browser-server.ts:88`
construct the per-test upload directory using:

```
const testRunId = `loop-lore-e2e-${Date.now()}-${Math.random().toString(36,).slice(2, 8)}`;
const testUploadDir = resolve("/tmp", testRunId, "uploads",);
mkdirSync(testUploadDir, { recursive: true, },);
```

`Date.now()` is millisecond resolution. `Math.random().toString(36).slice(2, 8)`
produces a 6-character base-36 suffix (~2.2B combinations, but only ~6 chars
of entropy). Under heavy parallelism (default `bun test --parallel=4`),
four workers can spawn test contexts in the same millisecond, with a
non-trivial probability that two workers generate identical `testRunId`s.

When that happens:

1. Worker A `mkdirSync` creates `/tmp/loop-lore-e2e-<id>/uploads/`.
2. Worker B's `mkdirSync` succeeds (no-op, already exists).
3. Both workers write assets to the same dir.
4. The first worker to call `ctx.close()` runs
   `rmSync(testDir, { recursive: true, force: true })` and deletes the dir
   the second worker is still using.
5. The second worker's subsequent `ctx.close()` either:
   - Tries to `rmSync` a non-existent dir (silent, OK).
   - Tries to write to a now-deleted dir (test fails with ENOENT).
6. Even if both close cleanly, an upload dir shared between tests creates
   cross-test asset bleed (uploaded file from test A visible in test B).

Severity is low at current worker counts (4) but the failure mode is
non-deterministic — collisions surface as flaky failures rather than
deterministic breakage.

Evidence:

```
tests/e2e/helpers/server.ts:352-356
  // Create temp upload dir under /tmp/ — NEVER in project dir or user home
  const testRunId = `loop-lore-e2e-${Date.now()}-${Math.random().toString(36,).slice(2, 8)}`;
  const testUploadDir = resolve("/tmp", testRunId, "uploads",);
  config.assets.uploadDir = testUploadDir;
  mkdirSync(testUploadDir, { recursive: true, },);

tests/e2e/helpers/browser-server.ts:88-91
  const testRunId = `loop-lore-e2e-${Date.now()}-${Math.random().toString(36,).slice(2, 8)}`;
  const testUploadDir = join("/tmp", testRunId, "uploads",);
  config.assets.uploadDir = testUploadDir;
  mkdirSync(testUploadDir, { recursive: true, },);
```

## Resolution

Already fixed in dev by `662ddfb14` (fix(db,test): lazy DB singleton + test-override hygiene). Verified 2026-09-20 against current dev (`609e5a45b`):

- `tests/e2e/helpers/server.ts:347-348` — `testRunId = \`loop-lore-e2e-${crypto.randomUUID()}\``; comment notes the rationale (per-process, per-call uniqueness, no shared mutable state).
- `tests/e2e/helpers/browser-server.ts:82-83` — same pattern.
- `src/db/test-db-helpers.test.ts:49-58` — 1000-iteration regression test asserts all generated `testRunId`s are unique.
- Cross-references: resolves alongside the other test-override-hygiene tickets in the same commit.

No code change required.


- [x] Replace `Date.now() + Math.random()` with `crypto.randomUUID()` in
      both `tests/e2e/helpers/server.ts:353` and
      `tests/e2e/helpers/browser-server.ts:88`.
- [x] Add a regression test that runs N=1000 `createTestServer()` calls
      in tight succession and asserts all `testRunId`s are unique.
- [x] Confirm no flakiness on `bun run test:e2e` after the change.
- [x] Document the parallel-safety contract (per-process, per-call
      uniqueness, no shared mutable state).

