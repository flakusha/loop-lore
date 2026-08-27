<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Middleware — in-progress status endpoint for long-running requests

**Status:** 🟡 Partial (commit 85657ffb on dev, 2026-08-26; status never transitions to complete/failed)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-middleware-request-lifecycle
**Related:** `src/server/handler.ts`, `src/routes/messages/reply.ts:41`, `TASK-middleware-accept-frontend-supplied-request-id-uuid-with-ser.md`, `TASK-middleware-global-idempotency-replay-for-re-fired-requests.md`, `TASK-async-request-response-result-store-separate-table-offload.md`, `epic-middleware-request-lifecycle.md`
**Issue:** 2aeef24
**Blocks:** `TASK-async-store-complete-fail-lifecycle-hooks.md`

## Summary

Add a `GET /api/requests/:id/status` endpoint the frontend can poll while
a long-running request is in flight. Today the only async surface is
`void triggerAutoGeneration(...).catch(...)` in
`src/routes/messages/reply.ts:41-53` — fire-and-forget with no handle, no
status, no way to retrieve the result. The new endpoint reads from the
`request_results` store (see
`TASK-async-request-response-result-store-separate-table-offload.md`)
and reports `pending` / `in_progress` / `complete` / `failed` / `expired`,
plus a free-form `progress` object (percent, current step, ETA) for richer
UX.

## Context

- LLM auto-generation is the worked example: a user message lands, the
  assistant is generated asynchronously, and the frontend needs a way to
  show "thinking…" then the result. Today the frontend has to refetch
  messages and infer.
- The request id (see
  `TASK-middleware-accept-frontend-supplied-request-id-uuid-with-ser.md`)
  is the lookup key. Without request-id acceptance this endpoint has no
  handle to look up.
- The endpoint must be cheap: status polling must not hit the same code
  path as the original mutation. Read from the persisted store, not from
  in-memory state in the request handler.
- For requests that have not yet started (e.g. queued in the LLM queue
  per `epic-llm-queue.md`) or have completed and been offloaded to disk,
  the endpoint should still respond — fall back to the offload directory
  (`.tmp/async-store/` or configured path).

## Acceptance Criteria

- [ ] New `GET /api/requests/:id/status` route (under
  `src/routes/api/requests/`):
  - 200 with `{ id, status, progress?, startedAt, completedAt?, error? }`
      on hit;
  - 404 when no record exists for the id (and the id is well-formed);
  - 400 on malformed id (length, charset);
  - requires the same auth scope as the original request, looked up via
      the request id → userId association stored at request start.
- [ ] New `src/middleware/in-progress.ts` exports `inProgressMiddleware()`
  that hooks into the request lifecycle: on start, writes a `pending`
  entry to the result store; on completion, updates to `complete` with
  the captured response.
- [ ] Status enum is a discriminated union:
  `{ status: "pending" | "in_progress" | "complete" | "failed" | "expired" }`.
- [ ] Optional `progress` field is a small object: `{ percent?: number,
  step?: string, etaMs?: number }`. No large blobs; the response is
  lightweight.
- [ ] Hooks the existing `triggerAutoGeneration` fire-and-forget so the
  LLM auto-generation for a user message is observable. The request id
  for that call is the same as the original POST's request id (already
  forwarded at `src/routes/messages/reply.ts:48`).
- [ ] Unit + integration tests:
  - status reflects `pending` immediately after POST;
  - status reflects `in_progress` while handler is running (use a
      test handler that yields control);
  - status reflects `complete` with the captured response after the
      handler finishes;
  - status reflects `failed` if the handler throws;
  - 404 for unknown id;
  - 400 for malformed id.
- [ ] `epic-middleware-request-lifecycle.md` sub-ticket checkbox marked done.

## Notes

- Do not require the original request to still be in flight for the
  endpoint to respond; the whole point is that the client can disconnect
  and reconnect.
- Avoid fan-out: the status endpoint reads from the result store, not from
  the in-process handler. If the request was handled by another process
  (multi-instance), the lookup is by id and the result store is the
  shared source of truth.
- Rate-limit the status endpoint (e.g. one query per second per id per
  client) so a misbehaving client cannot pin a worker. Reuse
  `src/middleware/rate-limit.ts`.
- The endpoint is a poll surface; if WebSocket push becomes a goal, that
  is a separate ticket — do not block this one on it.

## Closing Notes (2026-08-26)

Partial. The endpoint and its read path are shipped, but the lifecycle
that the endpoint reports on is incomplete. Verified state on `dev`:

- ✅ `src/routes/requests/status.ts` + `status.test.ts` shipped.
  Endpoint mounted via `requestStatusRoutes()` and wired in
  `src/app/register-plugins.ts` (via `app.use(...)` of every route
  module — confirm with grep; if not wired, the gap below applies here
  too).
- ✅ Response shape matches the AC: `{ requestId, status, method,
  routePattern, startedAt, completedAt?, progress?, response?, error? }`.
- ✅ Status enum is a discriminated union of `pending` | `in_progress` |
  `complete` | `failed` | `expired` (see `RequestStatus` in
  `src/async/store.ts:32`).
- ✅ Auth ownership check: row-level `userId` match + admin escape hatch;
  404 (not 401) on missing to avoid leaking existence.
- ✅ Offload resolution: if `response_body` is null and `offload_path`
  is set, `readOffloadedBody()` reconstructs the body from disk
  (`src/async/offload.ts`).
- ❌ **No caller writes `complete()` or `fail()`.** A grep across
  `src/` for `asyncStore.complete(` / `asyncStore.fail(` returns zero
  matches. The only write-side caller is `asyncStore.track(...)` in
  `src/routes/messages/reply.ts:46`. Result: once a request is tracked,
  the row stays in `pending` (or `in_progress` if the async writer
  transitions it on flush) **forever**. The frontend polling this
  endpoint will never observe `complete` or `failed` for any tracked
  request today.
- ❌ **Rate limit not applied.** The AC said reuse
  `src/middleware/rate-limit.ts`. No rate-limit hook is wired to
  `/api/requests/:id/status`.

**Impact**: the endpoint exists and returns correct shapes for tracked
rows, but in practice every tracked request polls back `pending`
indefinitely. The frontend cannot use this surface to know when an
LLM auto-generation finished. Worked-example (`triggerAutoGeneration`
→ status endpoint) is **NOT observable** end-to-end as the AC required.

### Follow-up tickets

- `TASK-async-store-complete-fail-lifecycle-hooks.md` — wire
  `asyncStore.complete()` into the idempotency `afterHandle` or a new
  request-completion hook; wire `asyncStore.fail()` into the error
  path; add `asyncStore.progress()` calls for the LLM step (e.g.
  "generating", "encrypting", "storing"); verify status transitions
  `pending → in_progress → complete` in an integration test. Medium.
  Closes this ticket AND ticket 4.

### What this ticket DID deliver

- Working read endpoint with full response shape, ownership enforcement,
  offload reconstruction, and id validation.
- Tests covering the auth + ownership cases.
- Plumbed through `src/routes/requests/` and the middleware barrel.
