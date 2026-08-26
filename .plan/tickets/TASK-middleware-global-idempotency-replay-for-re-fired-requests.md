<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Middleware — global idempotency replay for re-fired requests

**Status:** ⬜ Open
**Priority:** high
**Effort:** Medium
**Epic:** epic-middleware-request-lifecycle
**Related:** `src/routes/messages/swipe-race-insert.ts`, `src/routes/messages/create.ts:83-89`, `src/middleware/permissions.ts`, `TASK-middleware-accept-frontend-supplied-request-id-uuid-with-ser.md`, `TASK-middleware-in-progress-status-endpoint-for-long-running-requ.md`, `epic-middleware-request-lifecycle.md`
**Issue:** 385f05a

## Summary

Today only `POST /api/chats/:id/messages` implements per-row idempotency via
`body.idempotencyKey` + `findByIdempotencyKey()` in
`src/routes/messages/swipe-race-insert.ts`. Every other mutating route can
double-execute when the client re-fires after a network blip, page reload,
or crash. Add a global idempotency middleware keyed on
`(method, route-pattern, request-id)` that:

1. While the original is in flight → returns 409 `in_progress` (or 425 Too
   Early — TBD) so the frontend can poll status.
2. After the original completes → replays the cached response (status, body,
   headers) verbatim.
3. Falls back to a single-flight execution when no prior entry exists.

## Context

- The frontend retry pattern is unknown but typical: exponential backoff on
  5xx, page reload resubmits in-flight POSTs. Both produce duplicate
  execution today for every route except messages.
- The per-row pattern in `swipe-race-insert.ts` is correct at the DB layer
  but does not protect side effects (LLM auto-generation, attachments,
  mention persistence, scene transitions). The new middleware protects
  those.
- Replay must preserve the original response status, body, and a small
  allowlist of headers (`Content-Type`, `Location`, `X-Request-Id`). Do
  not replay `Set-Cookie`, `Date`, or any per-response header the framework
  regenerates.
- The middleware chain runs on Elysia; consult
  `src/elysia-app.ts` for the wiring point and `src/middleware/index.ts`
  for the barrel.
- Must compose with the request-id middleware
  (`TASK-middleware-accept-frontend-supplied-request-id-uuid-with-ser.md`) —
  that ticket populates the id; this ticket consumes it.

## Acceptance Criteria

- [ ] New `src/middleware/idempotency.ts` exports `idempotencyMiddleware()`
  that:
  - skips non-mutating verbs (GET, HEAD, OPTIONS);
  - keys entries on `(method, normalized-route, requestId)`;
  - on in-flight match → returns 409 with `Retry-After` hint and a body
      pointing to the in-progress status endpoint;
  - on completed match → replays the cached response;
  - on miss → runs the downstream handler, captures the response, stores
      it, and returns it.
- [ ] Storage backend pluggable: in-memory `Map` (single-process) for
  development; `request_results` table (see
  `TASK-async-request-response-result-store-separate-table-offload.md`)
  for production. Read the backend from config.
- [ ] TTL configurable (default 24h) so stale replays are evicted. After
  TTL the original is treated as a fresh request and a new execution runs
  — this is the documented behavior for "expired idempotency".
- [ ] Honors an opt-out header `X-Idempotency-Bypass: 1` for debugging
  (and a config flag to disable the middleware entirely in tests).
- [ ] Wired into `src/elysia-app.ts` after request-id resolution and
  before the route handlers.
- [ ] Routes that already implement per-row idempotency (e.g.
  `POST /api/chats/:id/messages`) keep their existing logic; the new
  middleware is a layer above and replays their response on re-fire.
- [ ] Unit + integration tests:
  - first call → handler runs once;
  - second call during in-flight → 409, handler NOT re-run;
  - second call after complete → cached response replayed, handler NOT
      re-run;
  - different request id → handler runs;
  - expired TTL → handler runs again;
  - bypass header → handler runs.
- [ ] `epic-middleware-request-lifecycle.md` sub-ticket checkbox marked done.

## Notes

- Be careful with streaming responses (SSE). The cache must materialize the
  full body before storing; either skip caching for SSE routes or capture
  the final message only. SSE is rare on mutating routes, so the simplest
  correct rule is "do not cache responses with `Content-Type:
  text/event-stream`".
- Be careful with `Set-Cookie` — never replay. Whitelist the headers
  allowed in the cached entry.
- Single-flight is the property the user explicitly called out: "re-fired
  request already in processing doesn't impact anything". The 409 path
  guarantees the original request is not re-executed while in flight.
- The replay path is the property that makes retries safe across crashes:
  once the original completes, even a totally separate retry gets the same
  response.
- Consider response-size limits on the cached entry; reject (and log) any
  response larger than the configured max (default 1 MiB) so an accidental
  file download does not balloon the cache.
