<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(server): track and clear the regex-telemetry flush timer on app stop

**Status:** Done
**Status Note:** fixed on this branch — the regex-telemetry flush interval is now tracked and cleared through the handle returned by `initBackgroundServices`, and the server shutdown stops it (`src/server/init-background-services.ts:14-17`, `:146-175`; `src/server/start.ts:226`, `:251`). Regression test in src/server/init-background-services.test.ts ("stop() clears the regex telemetry flush timer").
**Priority:** low
**Effort:** Medium
**Epic:** epic-server-lifecycle-hardening

**Summary:**

Sources: stream-a #7. Where: src/server/init-background-services.ts:136-145 (interval created, no handle); src/elysia-app.ts:213-216 (onStop stops scheduler only). Gap: the 60s setInterval flush timer is unrefd but never tracked or cleared - onStop flushes the async store and stops the cron scheduler only, so flushes can fire after the DB is destroyed during shutdown/teardown. Acceptance: initBackgroundServices returns the timer (or a stop fn) and onStop/shutdown clears it; no post-teardown DB writes from the flush path. Priority: low - teardown-order hygiene; unrefd timer limits production impact.

**Context:**

The 60s flush interval was created and `unref()`d but its handle was never kept, so nothing could clear it: the timer kept firing during teardown and could write to the DB after it was closed. `initBackgroundServices` now returns a handle with a `stop()` method that clears the interval, and the server shutdown calls it before the store flush and the server teardown. The handle is the smallest API that lets the owner clear the timer (exporting the timer itself would leak internals). The `unref()` call stays so the timer never holds the process open on its own.

**Acceptance Criteria:**

- [x] The flush interval handle is tracked and can be cleared
- [x] The server shutdown clears the timer (no post-teardown DB writes from the flush path)
- [x] The timer still never keeps the process alive on its own (`unref` kept)
- [x] Regression test asserts the timer is cleared by `stop()` (fails before the fix, passes after)
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- Root cause: the `setInterval` handle was dropped on the floor (only `unref()` was called), so no teardown path could clear the flush timer.
- Changed `src/server/init-background-services.ts:14-17` (`BackgroundServicesHandle`), `:29`/`:36` (return the handle), `:146`/`:149`/`:155` (track the timer), `:170-175` (`stop()` clears it); `src/server/start.ts:226` (keep the handle), `:251` (stop it during shutdown).
- Regression test: `src/server/init-background-services.test.ts` — "stop() clears the regex telemetry flush timer" (15 pass / 2 fail before the fix, 17 pass / 0 fail after).
