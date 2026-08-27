<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Middleware — Request Lifecycle, Idempotency & Async Results

**Status:** 🟢 Complete (reopened 2026-08-27 for review; defects fixed in worktree merge-review-followups)
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic

## Summary

End-to-end request-lifecycle support in the middleware layer: accept
client-supplied request IDs, provide global idempotency for re-fired requests,
expose an "in-progress" status surface the frontend can poll, and persist
request/response results to a dedicated store with cron/size/load/idle-driven
offload. Today `dev` only generates a server-side request id in
`src/server/handler.ts:64` and only one route (`POST /api/chats/:id/messages`)
implements per-row idempotency via `body.idempotencyKey` +
`src/routes/messages/swipe-race-insert.ts`.

## Motivation

The current state is sufficient for a single happy-path request, but the
frontends need:

1. **Idempotency on re-fire** — a POST that retries due to network blip, page
   reload, or client crash should not duplicate side effects. Today only
   `POST /api/chats/:id/messages` covers this; every other mutating route can
   double-execute.
2. **Request id that the frontend controls** — so the client can correlate
   the original POST with the eventual response, the in-progress poll, and
   server logs. Today `X-Request-Id` is server-generated; the client's UUID
   is ignored.
3. **In-progress status endpoint** — when a request is queued, generating,
   or paused, the frontend needs a way to ask "is it done yet?" without
   blocking the response. Today the only async surface is
   `void triggerAutoGeneration(...).catch(...)` in
   `src/routes/messages/reply.ts:41` — fire-and-forget with no handle.
4. **Persistent result store** — long-running requests (LLM generation, asset
   processing, imports) need their result captured so the client can retrieve
   it later even if it disconnected. Today the only durable artifact is the
   final database row; intermediate state is in memory.

## Scope

- Accept a frontend-supplied request identifier (UUID or other opaque key) in
  addition to the existing server-generated one.
- Provide a global idempotency middleware keyed on (route, request-id) so
  re-fires are no-ops while the original is in flight and replay the cached
  response after completion.
- Expose an `in-progress` status surface (per request id) and a `GET` endpoint
  the frontend can poll.
- Move async, non-blocking request handling off the request thread and
  persist results in a dedicated table; the table compresses and offloads to
  disk on cron / size / load / idle thresholds.
- Wire the LLM auto-generation path
  (`src/routes/messages/reply.ts:maybeAutoReply`) into the new infrastructure
  so its fire-and-forget surface is observable and queryable.

## Out of Scope

- Replacing per-row idempotency keys in domain tables (the
  `(chat_id, idempotency_key)` lookup in `swipe-race-insert.ts` stays; the new
  middleware is a layer above it).
- Migration of every existing route to async mode; the epic introduces the
  machinery and migrates the LLM-generation path as the worked example.
- WebSocket push notifications for completion (separate ticket if needed;
  the in-progress status endpoint is sufficient for an MVP).

## Sub-Tickets

- [x] TASK-middleware-accept-frontend-supplied-request-id-uuid-with-ser.md (d33734d) — ✅ done (requestIdMiddleware shipped + wired into Elysia derive)
- [x] TASK-middleware-global-idempotency-replay-for-re-fired-requests.md (385f05a) — ✅ done (idempotent() shipped + wired into Elysia chain)
- [x] TASK-middleware-in-progress-status-endpoint-for-long-running-requ.md (2aeef24) — ✅ done (status endpoint reads; lifecycle hooks now write complete/fail)
- [x] TASK-async-request-response-result-store-separate-table-offload.md (73eb1de) — ✅ done (store + offload daemon + lifecycle hooks shipped)

## Follow-up Tickets (wiring gap — now closed)

- [x] TASK-middleware-request-id-elysia-derive.md — wire `requestIdMiddleware()` into the Elysia `.derive()` chain. **DONE**: `elysia-app.ts` adds `.derive(requestIdMiddleware())` before auth derive; sets `x-request-id` header + `ctx.requestId`.
- [x] TASK-middleware-idempotency-wire-into-elysia.md — wire `idempotent()` into Elysia chain; **DONE**: `table` backend replaced by memory-only fallback with warning (BUG-middleware-idempotency-table-backend-unimplemented), in-flight slot released on throw (BUG-middleware-idempotency-orphaned-slot-permanent-409).
- [x] TASK-async-store-complete-fail-lifecycle-hooks.md — wire asyncStore.complete()/fail()/progress(); **DONE**: `fail()` error boundary now runs in validation onError (BUG-middleware-asyncstore-fail-dead-code), recordLifecycle marks 4xx/5xx `fail` not `complete` (BUG-middleware-recordlifecycle-marks-error-complete).

## Files (planned → actual)

- ~~`src/middleware/in-progress.ts`~~ — inlined into `src/async/store.ts` as `track` / `progress` / `complete` / `fail`. No separate file.
- `src/middleware/lifecycle.ts` ✅ — NEW: `recordLifecycle()` afterHandle captures response into `request_results`.
- `src/routes/requests/` ✅ — `GET /api/requests/:id/status` shipped (plan said `src/routes/api/requests/` — different path).
- `src/db/migrations/067_request_results.ts` ✅ — `request_results` table shipped.
- `src/async/store.ts` ✅ — result-store writer + writer API shipped; fire-and-forget drain loop composes with `apply.ts`.
- `src/async/offload.ts` ✅ — cron / size / load / idle trigger; spills to `.tmp/async-store/`.
- `src/routes/messages/reply.ts:55` — `triggerAutoGeneration` is called fire-and-forget; now passes `asyncStore`, which emits `progress` steps and `fail` on error.
- `src/elysia-app.ts` ✅ — NEW: wires `requestIdMiddleware` derive, `idempotency` before/afterHandle, `recordLifecycle`, error-boundary `fail`, and `onStop` flush.
- `src/config/schema/idempotency.ts` ✅ — NEW: `idempotency` config section (enabled/backend/ttlMs/bypassHeader).

## Related

- `src/server/handler.ts` — current request-id generation point.
- `src/routes/messages/swipe-race-insert.ts` — existing per-row
  idempotency pattern (reused, not replaced).
- `src/routes/messages/reply.ts:48` — currently forwards
  `X-Request-Id` to LLM auto-generation.
- `TASK-cors-middleware.md`, `TASK-api-key-auth-middleware.md` — adjacent
  middleware work; the new middleware chain is composable with these.
- `epic-llm-queue.md` — sibling concern; the LLM queue epic tracks
  throughput-side concerns, this epic tracks the HTTP request-side.
- `epic-observability-telemetry.md` — request-id propagation feeds the
  telemetry/observability pipeline.
- `epic-headless-alternative-frontends.md` — headless and external
  consumers benefit most from idempotency and async result retrieval.


## Reopened — review findings (2026-08-27)

This epic was marked 🟢 Complete by `263befef` (docs(plan): mark epic-middleware-request-lifecycle complete), but a code review of the merged middleware lifecycle work found load-bearing defects. The epic is reopened (status In Progress) until the bugs below are fixed:

- `BUG-middleware-asyncstore-fail-dead-code.md` — `asyncStore.fail()` error boundary is dead code (validation onError returns first; Elysia short-circuits).
- `BUG-middleware-idempotency-table-backend-unimplemented.md` — `table` backend == memory; `asyncStore` param dead.
- `BUG-middleware-idempotency-orphaned-slot-permanent-409.md` — in-flight slot never released on throw → permanent 409.
- `BUG-middleware-recordlifecycle-marks-error-complete.md` — 4xx/5xx responses recorded as `complete`, not `fail`.
- `BUG-middleware-requestid-dual-write-last-wins.md` — same requestId row dual-written with last-write-wins.

The `requestIdMiddleware` derive wiring (`TASK-middleware-request-id-elysia-derive.md`) is correct and stays ✅ done. The two follow-up sub-tickets above were re-marked ⬜ Open because their ACs are unmet.


## Resolution (2026-08-27)

The defects listed in "Reopened — review findings" were all fixed in worktree `merge-review-followups` (committed and finalized to `dev`):

- `BUG-middleware-asyncstore-fail-dead-code.md` — fixed: validation `onError` now calls `asyncStore.fail()` AND `idem.release()` before returning; the dead separate error-boundary handler was removed.
- `BUG-middleware-idempotency-table-backend-unimplemented.md` — fixed: `table` backend replaced by a memory-only fallback with `console.warn`; dead `asyncStore` param removed from `idempotent()`.
- `BUG-middleware-idempotency-orphaned-slot-permanent-409.md` — fixed: in-flight slot released on handler throw (error boundary calls `idem.release`).
- `BUG-middleware-recordlifecycle-marks-error-complete.md` — fixed: `recordLifecycle` gates on status — 2xx/3xx → `complete`, 4xx/5xx → `fail`.
- `BUG-middleware-requestid-dual-write-last-wins.md` — fixed: HTTP lifecycle owns the terminal `complete`; async generation only writes `progress`/`fail` when the row is not already `complete`.

Backend `tsc` is clean and the middleware/idempotency/async tests pass. Epic marked complete again.
