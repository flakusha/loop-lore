<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->
# BUG: NotificationStreamer error path is unreachable — allSettled swallows failures

## Problem

`src/routes/notifications/stream.ts:51-54` (tick) and `:74-77` (start) wrap
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

## Where

- `src/routes/notifications/stream.ts:49-66` — tick callback, allSettled at :51-54, catch at :63-65
- `src/routes/notifications/stream.ts:71-93` — start callback, allSettled at :74-77, catch at :87-93 (never executes)

## Discovered

2026-09-10 — while writing coverage tests for `routes/notifications/stream.ts`
in worktree `coverage-review-fixes`. Tests could not cover the start-callback
catch branch because the code path is unreachable.
