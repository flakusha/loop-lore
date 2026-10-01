<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Browser e2e suite flakes under concurrent runs

**Summary:** The 'e2e - browser (baseline)' gate fails intermittently with a rotating set of files. Not resource contention - a click/wait response race in five login helpers that only loses under load.
**Context:** scripts/check-parallel.mjs truncated failing-gate output to head-5 + tail-20, discarding the assertion and making the failure look like resource contention for several sessions.
**Acceptance Criteria:** Waiters are armed before the click that triggers them in every browser flow, and a failing gate's full output is persisted so the assertion is always recoverable.
**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-e2e-integration-testing.md
**Tags:** e2e-integration-testing

## Summary

The 'e2e - browser (baseline)' gate fails intermittently with a rotating set of files, while other files in the same run pass.

The original diagnosis in this ticket was wrong on two counts, both disproven by reproduction:

1. **The suite is not concurrent.** `scripts/run-browser-tests.ts` is a strict `for` loop that awaits `child.exited` before spawning the next file, with `--max-concurrency=1`. Nothing runs in parallel inside the suite.
2. **The `async-store write failed` lines are not a failure signal.** `src/async/store.ts` drains a fire-and-forget queue whose catch only logs and never rethrows, so it cannot fail a test - it is emitted in fully green runs. It is a teardown artifact: `tests/e2e/helpers/browser-server.ts` `cleanup()` runs `browser.close()`, `bunServer.stop()` and `db.destroy()` inside one `Promise.allSettled`, so the SQLite handle closes while writes are still queued (`RangeError: Cannot use a closed database`).

## Why the failure was invisible

`scripts/check-parallel.mjs` printed only the first 5 and last 20 lines of a failing check's output, with a literal `...` for the elided middle. For a 35-file suite run the discarded middle is exactly where the failing test's assertion lives, so a red gate reported `0 fail` immediately above `Browser suite failed: 1/35 files failed` with no cause at all. The 'rotating file' in the old evidence was an artifact of which file ran when the assertion got dropped, not the file that actually failed.

## Root cause

Five browser flows logged in through the UI with the response waiter attached *after* the click:

```ts
await page.click("[data-testid='login-submit']");
await page.waitForResponse((res) => res.url().includes("/api/auth/login"), ...);
```

Once the htmx POST lands there is nothing left to wait for, so the wait can only burn its full timeout. On an idle host the response is slow enough that the listener attaches in time and the test passes; under gate load it arrives first and the test fails after 30 s. The endpoint itself is correct (`src/views/login.html` `hx-post="/api/auth/login"`, mounted at `src/routes/auth/index.ts` `${prefix}/auth/login`).

The other flows in the suite (`chat-flow`, `gallery-flow`, `settings-flow`, `new-chat-advanced-fields`, the `access-correctness` worlds fetch) already used the correct arm-then-click order, which is why the bug survived in exactly the login helpers.

## Impact

The gate could not be trusted to gate a merge: a red run and a green run were both 'correct', and no session could see the real cause.

## Acceptance Criteria

- [x] Every `waitForResponse` is armed before the click that triggers it.
- [x] A failing gate persists its untruncated output under `.tmp/run-<RUN_ID>/check-fail-<slug>.log` so the assertion is recoverable without a re-run.
- [x] The browser gate is green across repeated runs under `check`.
- [x] Documentation updated — `AGENTS.md` now documents the `Full output:` path under the check-report contract.

## Out of scope (filed separately)

- `browser-server.ts` `cleanup()` destroys the DB without first quiescing the async store, producing the swallowed teardown noise. The store's flush is registered through Elysia `app.onStop`, which never fires because the harness serves via `Bun.serve({ fetch })` instead of `app.listen()`. Filed as `BUG-browser-teardown-destroys-the-db-before-flushing-the-async-s` (7ce47b5).
- `src/async/spill.ts` `OFFLOAD_DIR` is a fixed, CWD-relative, never-GC'd path shared by every worktree. Ruled out as the cause of this flake, but a real cross-run hazard on its own. Filed as `BUG-async-spill-offload-dir-is-a-fixed-cwd-relative-path-shared-` (0114005).

## Verification

The click/wait race reproduces on demand. Four login-heavy browser files
(`access-correctness`, `auth-flow`, `admin-dashboard-empty`,
`admin-dashboard-populated`) run three times each while the CPU is
saturated by a busy loop:

- patched: 3/3 runs green (11 pass / 0 fail each).
- unpatched (waiter re-attached after the click): run 2 fails
  `non-admin cannot load the admin view`.

Same tree, same host, same load — the ordering is the variable, so the
fix is load-bearing rather than a lucky pass.

### Second defect, same gate

Only reachable once the first was fixed and the gate ran again during
finalize: `encryption-flow.browser.ts` polled the messages API with a fixed
`20 x 250 ms` loop, capping the wait at 5 s. The row is committed by the
send request the test has not yet observed completing, so under gate load
the INSERT outran the window and the assertion read a 200 response whose
body simply did not contain the message yet. Now polls to a 30 s
deadline, which leaves headroom under the test's own 60 s budget.

Worth recording as a pattern: **every one of these was a fixed attempt
count standing in for a wait that had no observable completion signal.**
Both the click/wait ordering and the poll cap are the same mistake at two
scales.
