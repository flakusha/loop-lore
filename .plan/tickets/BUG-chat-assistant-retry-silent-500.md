<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: assistant reply unique-constraint retry exhausts then throws raw SQLite error to the client

**Status:** ✅ Resolved (verified 2026-09-07; bookkeeping)
**Severity:** medium
**Priority:** medium
**Effort:** small
**Type:** BUG
**Epic:** epic-chat-lifecycle-moderation
**Files:** src/routes/messages/reply.ts:100-129

## Issue

The assistant reply retry loop (`reply.ts:100-129`) catches unique-index collisions on `swipe_index` and retries up to 8 times. When all 8 retries collide, the function `throw lastError` — the last SQLite UNIQUE constraint error, which contains the table name, index name, and sometimes row data (column names + bound values).

The error bubbles into Elysia's default error handler as a 500, with the **raw constraint text leaked** to the client. The client sees something like `SQLITE_CONSTRAINT: UNIQUE constraint failed: messages.idx_messages_swipe_unique` — DB engine internals that should not surface.

Even on a successful retry, `lastError` is a stale variable referencing the previous error object (functional but misleading during log inspection).

## Why it matters

Security / UX. Database constraint names and column names leak to the caller (information disclosure). Slow users see "uncaught exception" instead of a graceful "service busy, retry".

## Evidence

- `src/routes/messages/reply.ts:102-129` — retry loop; `throw lastError` on exhaustion.
- Default Elysia error handler returns 500 with raw error message.

## Concrete fix

1. After exhausting retries, return a structured 503:

   ```typescript
   return new Response(
     JSON.stringify({ error: "service_busy", message: "Could not persist reply due to high concurrency. Please retry.", retryAfterMs: 200 }),
     { status: 503, headers: { "Retry-After": "1", "Content-Type": "application/json" } },
   );
   ```

2. Reduce retry count to 4 with exponential backoff (current: 8 linear — a write-storm can lock others out).
3. Log the final exhaustion to telemetry (event type: `generation.swipe_retry_exhausted`) with the chat id and depth, but strip the raw SQLite error from the client-facing response.
4. Reset `lastError` to `undefined` on success.

## Tests

- `bun test src/routes/messages/reply.test.ts` — stub unique-index to always collide; verify 503 with `{error: "service_busy"}` body, NOT 500 with raw SQL text.
- Successful retry path: 3 collisions, 4th succeeds; verify response is 200 and `lastError` is cleared in the log.

## Related

- `BUG-chat-message-create-swipe-race` (same invariant, user-message path).
- `epic-chat-lifecycle-moderation.md`.

## Resolution

Verified on dev HEAD (2026-09-07). src/routes/messages/reply.ts:79-180 scopes the retry loop to `isSwipeIndexUniqueViolation(err)` — other errors (FK violation, encryption error, schema mismatch) are rethrown immediately so Elysia's handler surfaces the real cause as 5xx. On exhausted retries the response is a structured 503 with `code: "service_busy"` and `retryAfterMs: 200`. Stale `lastError` variable is cleared after a successful insert (line `lastError = undefined;`).
