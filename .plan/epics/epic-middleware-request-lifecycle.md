<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Middleware — Request Lifecycle, Idempotency & Async Results

**Status:** 🟡 In Progress (foundation shipped; wiring gap blocks production use)
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

- [x] TASK-middleware-accept-frontend-supplied-request-id-uuid-with-ser.md (d33734d) — 🟡 partial (Elysia-side wiring gap, see Closing Notes)
- [x] TASK-middleware-global-idempotency-replay-for-re-fired-requests.md (385f05a) — 🟡 partial (middleware not wired into route chain, see Closing Notes)
- [x] TASK-middleware-in-progress-status-endpoint-for-long-running-requ.md (2aeef24) — 🟡 partial (status endpoint reads, but no caller writes `complete`/`fail`, see Closing Notes)
- [x] TASK-async-request-response-result-store-separate-table-offload.md (73eb1de) — 🟡 partial (store + offload daemon shipped, lifecycle hooks missing, see Closing Notes)

## Follow-up Tickets (block production use)

- [ ] TASK-middleware-request-id-elysia-derive.md — wire `requestIdMiddleware()` into the Elysia `.derive()` chain. **BLOCKER** for ticket 2 follow-up.
- [ ] TASK-middleware-idempotency-wire-into-elysia.md — call `idempotent()` in the Elysia app chain; add `X-Idempotency-Bypass` header + `config.idempotency.enabled` flag; bump TTL default to 24h. Depends on the request-id follow-up.
- [ ] TASK-async-store-complete-fail-lifecycle-hooks.md — wire `asyncStore.complete()` / `fail()` / `progress()` into the request lifecycle (idempotency `afterHandle`, global error boundary, `triggerAutoGeneration` steps). Closes the partial state on tickets 3 + 4. Depends on the idempotency follow-up.

## Files (planned → actual)

- `src/middleware/request-id.ts` ✅ — accept frontend UUID, fall back to
  server-generated; exposed via `resolveRequestId` / `applyRequestId` /
  `requestIdMiddleware`. Used by `handler.ts`; **NOT yet used by Elysia
  routes** (see follow-up ticket).
- `src/middleware/idempotency.ts` ✅ — module + tests shipped; exported
  as `idempotent()` (ticket said `idempotencyMiddleware()`).
  **Not wired** (see follow-up ticket).
- ~~`src/middleware/in-progress.ts`~~ — inlined into `src/async/store.ts`
  as `track` / `progress` / `complete` / `fail`. No separate file.
- `src/routes/requests/` ✅ — `GET /api/requests/:id/status` shipped
  (plan said `src/routes/api/requests/` — different path).
- `src/db/migrations/067_request_results.ts` ✅ — `request_results` table
  shipped (plan said `XXXX_request_results.ts` — concrete number assigned
  by db:sync).
- `src/async/store.ts` ✅ — result-store writer + writer API shipped.
  The fire-and-forget drain loop composes with `apply.ts`.
- `src/async/offload.ts` ✅ — cron / size / load / idle trigger; spills
  to `.tmp/async-store/` (matches plan).
- `src/routes/messages/reply.ts:55` — `triggerAutoGeneration` is called
  fire-and-forget; `asyncStore.track()` is called before, but the LLM
  completion path does NOT write `asyncStore.complete()` (see follow-up
  ticket for the worked-example completion).

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
