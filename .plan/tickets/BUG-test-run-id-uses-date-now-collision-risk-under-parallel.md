<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: test-run-id-uses-Date-now-collision-risk-under-parallel

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

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

## Acceptance Criteria

- [ ] Replace `Date.now() + Math.random()` with `crypto.randomUUID()` in
      both `tests/e2e/helpers/server.ts:353` and
      `tests/e2e/helpers/browser-server.ts:88`.
- [ ] Add a regression test that runs N=1000 `createTestServer()` calls
      in tight succession and asserts all `testRunId`s are unique.
- [ ] Confirm no flakiness on `bun run test:e2e` after the change.
- [ ] Document the parallel-safety contract (per-process, per-call
      uniqueness, no shared mutable state).

