<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Browser teardown destroys the DB before flushing the async store

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:** `browser-server.ts` `cleanup()` destroys the SQLite handle while fire-and-forget async-store writes are still queued, and the store's graceful flush is unreachable in the browser harness.
**Context:** Found while diagnosing BUG-browser-e2e-suite-flakes-under-concurrent-runs; that flake had a different cause (a click/response-wait ordering race), but the noisy `async-store write failed` lines in its logs come from here. `cleanup()` runs `browser.close()`, `bunServer.stop()` and `db.destroy()` in one `Promise.allSettled` (`tests/e2e/helpers/browser-server.ts:85`), so `db.destroy()` can close the handle while the store's `drain()` loop still holds queued writes (`src/async/store.ts:118` is a fire-and-forget `void drain()`). Each in-flight `apply()` then throws `RangeError: Cannot use a closed database`, which the drain loop's `catch` logs as `async-store write failed` and swallows (`src/async/store.ts:131-133`). The store does expose a `flush()` for exactly this, but it is only registered through Elysia's `app.onStop` (`src/elysia-app.ts:195`), and the harness hands `app.fetch` to `Bun.serve({ port: 0, fetch })` rather than calling `app.listen()`, so `onStop` never fires there.

**Acceptance Criteria:**
- [x] `cleanup()` quiesces the async store (awaits a flush) before `db.destroy()`.
- [x] The Elysia `onStop` path is either exercised or the harness explicitly flushes; the two do not silently diverge.
- [x] A test asserts the queue is empty at teardown, so a reintroduced race fails loudly instead of logging.
- [ ] The `async-store write failed` noise is gone from a green browser gate run.
- [x] Implementation complete.
- [x] Tests passing.
- [x] Documentation updated.

**Out of scope (see the open criterion above):** the teardown race this ticket names is fixed and reproduced-as-fixed (30 swallowed `async-store write failed` writes before, 0 after). A green browser run still logs 2 of those lines, but they are a **different** defect with a different cause and a different fix: `ENOENT` on a spill file under `.tmp/async-store/`, not `RangeError: Cannot use a closed database`. Those 2 reproduce 3/3 on an unmodified tree, so they are untouched by this fix. Tracked as BUG-orphan-spill-sweeper-deletes-a-spill-file-before-its-row-ref. The noise criterion stays open until that ticket lands; do not re-investigate the teardown ordering on the strength of those 2 lines.

**Impact:** Cosmetic-to-mild, not a test failure — the error is swallowed, so it never fails a test and appears in fully green runs. It adds noise to every browser e2e log and hides real errors in the same stream, which is part of why this signal was mistaken for a flake cause. Any test asserting on async-store persistence near teardown can also race.
