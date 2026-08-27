<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire `asyncStore.complete()` / `fail()` / `progress()` into the request lifecycle

**Status:** ⬜ Open
**Priority:** high
**Effort:** Medium
**Epic:** epic-middleware-request-lifecycle
**Related:**
- `src/async/store.ts` (existing API: `track`, `progress`, `complete`, `fail`)
- `src/middleware/idempotency.ts` (wires `recordResponse` into the chain — needs the call here)
- `src/elysia-app.ts` (global error boundary + afterHandle hook)
- `src/generation/auto-gen/auto-generation.ts` (LLM step progress calls)
- `src/routes/messages/reply.ts:55` (fire-and-forget `triggerAutoGeneration`)
- `TASK-async-request-response-result-store-separate-table-offload.md` (the partial parent)
- `TASK-middleware-in-progress-status-endpoint-for-long-running-requ.md` (the partial parent)
- `TASK-middleware-idempotency-wire-into-elysia.md` (needs the `afterHandle` recording this depends on)

## Summary

`src/async/store.ts` ships a complete write API — `track`, `progress`, `complete`,
`fail`, `flush` — but the only caller in production is `asyncStore.track(...)`
in `src/routes/messages/reply.ts:46`. Rows therefore stay in `pending`
indefinitely; the status endpoint at `GET /api/requests/:id/status` reads back
`pending` forever for every tracked request, and the `table` backend of the
idempotency middleware has no `complete` rows to replay. This ticket wires the
lifecycle hooks so rows transition `pending → in_progress → complete | failed`
and emit named `progress` updates for the LLM step.

## Context

Verified state on `dev` at HEAD:

- `src/async/store.ts:128-151` exports:
  - `track({ id, method, routePattern, userId })` — fire-and-forget upsert
    with `status = "pending"`.
  - `progress(id, { progress })` — fire-and-forget update to
    `status = "in_progress"` + `progress` JSON.
  - `complete(id, { status, headers, body })` — fire-and-forget update to
    `status = "complete"` with captured response.
  - `fail(id, errorMessage)` — fire-and-forget update to `status = "failed"`.
  - `flush()`, `read(id)`, `config`, `destroy()`.
- `src/routes/messages/reply.ts:46` is the **only** production caller — `track()`
  only. No `complete`, `fail`, or `progress` calls anywhere.
- `src/routes/requests/status.ts:59` reads via `asyncStore.read(id)` and
  surfaces whatever's there (status enum is a discriminated union, all five
  values valid).
- `src/elysia-app.ts:46-48` constructs the store at boot.

The async store's `apply()` already handles all four write kinds:
`upsert` (track), `progress` (in_progress), `complete`, `fail`. The
migration `067_request_results.ts` already has the columns and indexes.
The work is wiring the calls into the right hook points.

## Acceptance Criteria

- [ ] New `src/middleware/lifecycle.ts` (or extend `src/middleware/idempotency.ts`)
      exports a `recordLifecycle(afterHandle)` hook that:
      1. resolves `ctx.requestId`,
      2. on success (2xx response): calls
         `asyncStore.complete(id, { status: response.status, headers: whitelisted, body: text })`,
      3. on error (4xx/5xx response): calls `asyncStore.fail(id, errorMessage)`,
      4. returns the response unchanged.
      Place AFTER the idempotency `afterHandle` so it sees the recorded response.
- [ ] Global error boundary in `src/elysia-app.ts` (the `.onError(...)` step)
      resolves `ctx.requestId` and calls `asyncStore.fail(id, errorMessage)`,
      so uncaught throws in handlers still mark the row failed (not stuck on
      pending).
- [ ] `src/routes/messages/reply.ts:55-67` `triggerAutoGeneration(...)` chain
      emits named `asyncStore.progress(id, { progress: { step: "generating" } })`
      before the LLM call, then `{ step: "encrypting" }` before `encryptMessageContent`,
      then `{ step: "storing" }` before `storeMessage`. The existing `.catch(...)`
      should also call `asyncStore.fail(id, String(error))`.
- [ ] Verify the row transitions `pending → in_progress → complete` end-to-end
      in an integration test:
      1. POST `/api/chats/:id/messages` with a request id,
      2. immediately GET `/api/requests/:id/status` → `pending` or `in_progress`,
      3. wait for the request to settle,
      4. GET `/api/requests/:id/status` again → `complete` with `response.body`
         matching the original POST response.
- [ ] Verify the failure path: handler throws → row goes to `failed` with
      `error` populated; `completedAt` set; `responseBody` null.
- [ ] `idempotency.recordResponse()` calls `asyncStore.complete(...)` instead
      of (or in addition to) writing to its in-memory cache, so the table
      backend of the idempotency middleware actually has data to replay from.
- [ ] Add `asyncStore.flush()` to graceful shutdown in
      `src/server/handler.ts:createRequestHandler` (or `src/elysia-app.ts` if
      there's a shutdown hook).
- [ ] `epic-middleware-request-lifecycle.md` sub-ticket status updates.

## Notes

- The async store's writes are fire-and-forget via a single drain loop. The
  status endpoint may briefly show `pending` even after the handler returned,
  because the drain loop hasn't flushed yet. `asyncStore.flush()` blocks until
  the queue is empty — useful for tests, not for the hot path.
- Progress updates are best-effort. Don't fail the request if the progress
  write fails — the store logs the error and drops the write.
- The `complete()` write must NOT include the raw `Set-Cookie` header in the
  stored response headers (idempotency replay must not mint a new session).
  The same header whitelist the idempotency middleware uses
  (`filterReplayHeaders`) applies here.
- `fail()` should NOT include the response body if the failure was an
  uncaught throw before a response was produced. The handler should pass an
  error message only.
- Offload: `complete()` writes inline if the body fits under
  `config.asyncStore.maxInlineBytes` (default 1 MiB). Larger bodies are
  offloaded by the daemon, NOT by `complete()` — the writer just stores the
  body and the daemon handles the rest. Don't try to do offload from inside
  `complete()`.

## Out of Scope

- Storing the `progress` payload size limit (currently unbounded — a noisy
  client could bloat the row). Add a size cap in a future ticket.
- Replaying failures through the status endpoint (the status endpoint already
  surfaces `failed` rows correctly — no replay needed).
- Encrypting the `responseBody` at rest (Notes section of the parent ticket;
  not an AC here).


## Review Update (2026-08-27)

The epic marked this done, but the AC is **not met**: the `asyncStore.fail()` error boundary in `src/elysia-app.ts` is dead code (validation onError returns first; Elysia short-circuits, so `fail()` never runs), and `recordLifecycle` marks 4xx/5xx responses `complete` instead of `fail`. See `BUG-middleware-asyncstore-fail-dead-code.md` and `BUG-middleware-recordlifecycle-marks-error-complete.md`. Status stays ⬜ Open.
