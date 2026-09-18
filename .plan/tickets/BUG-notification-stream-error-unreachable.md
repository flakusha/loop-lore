<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: NotificationStreamer error path is unreachable — allSettled swallows failures

**Priority:** medium
**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done — fixed in batch (loadNotificationSnapshot extracted, 4 tests green, 2026-09-16)

## Problem

`src/routes/notifications/stream.ts:51-55` (tick) and `:71-75` (start) wrap
their DB work in `Promise.allSettled([...])` and resolve the result inline.
This means the surrounding `try { ... } catch` blocks can NEVER throw
on a DB error — `allSettled` always resolves. The catch branches that emit a
`stream-error` event with a `correlationId` are unreachable.

```ts
const tick = async (controller) => {
  try {
    const [countRes, recentRes] = await Promise.allSettled([
      service.getUnreadCount(this.userId),
      service.list(this.userId, false),
    ]);
    const count = countRes.status === "fulfilled" ? countRes.value : 0;
    ...
  } catch {
    // transient DB error — skip this tick, keep stream alive
  }
};
```

The `catch` is unreachable when DB throws; the `stream-error` SSE event is
dead code.

## Suggested fix

Either:
- (a) Replace `Promise.allSettled` with `Promise.all` (or `.try`) so the catch
  fires, emit `stream-error` only on the initial snapshot and silently skip
  ticks, OR
- (b) Inspect `countRes.status === "rejected"` and explicitly send the
  stream-error event in the start path.

Option (a) preserves the "keep stream alive on tick failures" property while
making the initial-snapshot failure visible to the client.

## Where (fixed 2026-09-16 — allSettled kept, semantics clarified + deduped)

`loadNotificationSnapshot()` extracted (`stream.ts:32-45`) owns the allSettled degradation contract (query failure → empty default, never throws). `tick` and `start` route through it; their `catch` blocks now cover only transport-level throws (enqueue on closed controller, mock-DB constructor throws), which are reachable. Start-path `stream-error` emission preserved. Duplicated query blocks removed (net −20 lines across tick/start).
- `src/routes/notifications/stream.ts:32-45` — helper, allSettled + empty defaults
- `src/routes/notifications/stream.ts:76-89` — tick callback via helper
- `src/routes/notifications/stream.ts:91-106` — start callback via helper, catch emits stream-error

## Discovered

2026-09-10 — while writing coverage tests for `routes/notifications/stream.ts`
in worktree `coverage-review-fixes`. Tests could not cover the start-callback
catch branch because the code path is unreachable.

## Resolution

Fixed in this batch (worktree `fix-batch-20260916`). Chose ticket option (b)-adjacent: kept `allSettled` (ESLint bans `Promise.all` — unhandled-rejection risk) and documented the degradation contract on the extracted helper, so `catch` reachability is explicit: query failures degrade silently by design; transport throws surface via `stream-error`. Regression: 2 new `loadNotificationSnapshot` tests (live snapshot + broken-DB defaults). `bun test src/routes/notifications/stream.test.ts` → 4 pass, 0 fail.

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
