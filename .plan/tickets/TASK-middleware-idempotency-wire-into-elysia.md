<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire `idempotent()` middleware into the Elysia route chain

**Status:** ✅ Done (fixed in worktree merge-review-followups, 2026-08-27)
**Priority:** high
**Effort:** Medium
**Epic:** epic-middleware-request-lifecycle
**Related:**
- `src/middleware/idempotency.ts` (existing module — needs wiring)
- `src/elysia-app.ts` (wire point)
- `src/app/register-plugins.ts` (alternative wire point via global `.guard()`)
- `src/middleware/request-id.ts` (provides `ctx.requestId` — must be wired first)
- `src/async/store.ts` (`asyncStore` for the table backend)
- `TASK-middleware-request-id-elysia-derive.md` (BLOCKER — idempotency reads `ctx.requestId`)
- `TASK-middleware-global-idempotency-replay-for-re-fired-requests.md` (the partial parent)
- `TASK-async-store-complete-fail-lifecycle-hooks.md` (the table backend needs `complete()` writes)

## Summary

`src/middleware/idempotency.ts` ships the full `idempotent()` middleware factory
with pluggable backend, in-memory cache, 409 in-flight response, replay path,
header whitelist, and 113 lines of tests. **Zero production callers.** No
migrated route is protected today; every mutating route except
`POST /api/chats/:id/messages` (per-row idempotency in
`src/routes/messages/swipe-race-insert.ts`) still double-executes on re-fire.
This ticket wires the middleware into the Elysia chain, adds the bypass header,
and surfaces the config flag.

## Context

Verified state on `dev` at HEAD:

- `src/middleware/idempotency.ts` exports `idempotent(config)` returning
  `{ backend, ttlMs, beforeHandle, recordResponse, clear }`.
- `src/middleware/index.ts:14` re-exports it. No other file imports it.
- `src/elysia-app.ts:50-95` builds the Elysia app chain with no `idempotent()`
  call.
- `src/app/register-plugins.ts:111-213` registers every route module via
  `app.use(...)`. No call to `idempotent()`.
- `idempotent()` is NOT in any production codepath today — only its unit test
  imports it directly.

The middleware composes with:

1. **Request-id middleware** (see `TASK-middleware-request-id-elysia-derive.md`)
   — needs `ctx.requestId` populated BEFORE the idempotency `beforeHandle`
   runs. Without it, every request is a miss and no replay/409 is possible.
2. **Async store** (`src/async/store.ts`) — the `table` backend reads/writes
   through the same store, but currently no caller writes `complete()`
   (see `TASK-async-store-complete-fail-lifecycle-hooks.md`). The `memory`
   backend works without the async store.

This ticket only handles the wiring + bypass + config. The lifecycle hooks
that make the table backend persist real `complete` rows are in a separate
ticket (`TASK-async-store-complete-fail-lifecycle-hooks.md`); once those land,
the `table` backend becomes functional end-to-end.

## Acceptance Criteria

- [ ] `src/elysia-app.ts` calls `idempotent({ backend: config.idempotency.backend ?? "memory", ttlMs: config.idempotency.ttlMs ?? 24 * 60 * 60 * 1000, asyncStore, })`
      and applies the returned `beforeHandle` to the app's middleware chain.
      Place AFTER `requestIdMiddleware()` and BEFORE route registration.
- [ ] Wire `idempotent.beforeHandle` via a `.guard({ beforeHandle: ... }, ...)` on the
      `registerPlugins` app — covers all migrated route modules. Migrated routes
      that are non-mutating (GET/HEAD/OPTIONS) skip idempotency internally; the
      middleware short-circuits to `return undefined` for those.
- [ ] Implement `X-Idempotency-Bypass: 1` header in `src/middleware/idempotency.ts`:
      when present, the `beforeHandle` returns `undefined` without consulting the
      cache. Header is read BEFORE the cache lookup.
- [ ] Add `config.idempotency.enabled: boolean` (default `true`) and an
      `idempotency.bypassHeader: boolean` flag to `src/config/schema.ts`.
      When `enabled === false`, the middleware factory returns a pass-through
      `beforeHandle`. Useful for tests + emergency kill-switch.
- [ ] Wire `recordResponse()` into the Elysia `afterHandle` chain so that
      successful (2xx) responses land in the cache after the handler runs.
      Non-2xx responses (4xx, 5xx) are NOT cached — re-firing a failed
      request should be allowed to retry. Failures route to
      `asyncStore.fail(id, errorMessage)` (depends on
      `TASK-async-store-complete-fail-lifecycle-hooks.md`; mark the call site
      TODO until then).
- [ ] Bump default TTL from 5 min (current shipped value) to 24 h (the AC's
      default). 5 min was set conservatively during the initial drop; the
      ticket explicitly said 24h.
- [ ] Integration tests (E2E or `src/middleware/idempotency.integration.test.ts`):
      - first POST `/api/chats/:id/messages` with a request id → handler runs
        once; row inserted in `request_results` (when async store hooks land);
      - second POST with same id while in flight → 409, handler NOT re-run,
      - second POST after completion → cached response replayed verbatim,
        handler NOT re-run,
      - POST with `X-Idempotency-Bypass: 1` → handler runs,
      - POST with no `X-Request-Id` → no idempotency check (handler runs,
        no 409, no replay),
      - POST with malformed request id → no idempotency check,
      - 4xx response → NOT cached (re-fire runs handler again),
      - TTL expiry → next call treated as fresh.
- [ ] `epic-middleware-request-lifecycle.md` sub-ticket status updates.

## Notes

- The middleware is process-local for the `memory` backend. For multi-instance
  deployments, the table backend is required (via `asyncStore`). Until
  `TASK-async-store-complete-fail-lifecycle-hooks.md` lands, only single-instance
  prod gets correct replay behavior.
- The bypass header is intentionally a magic value (`"1"`) to avoid a parsing
  ambiguity (string `"true"` vs. `"1"` vs. `"yes"`). The config flag is the
  durable kill-switch.
- The middleware factory returns a fresh cache per call. If `.guard(...)`
  builds a new instance per route, the cache is per-route — undesirable.
  Mount the factory call ONCE on the app, not per route. The `idempotent()`
  return shape supports this: apply the SAME `beforeHandle` to a `.guard()`
  that wraps all migrated routes.
- The replay path strips `Set-Cookie`, `Connection`, `Keep-Alive`,
  `Transfer-Encoding`, `Upgrade`, `Content-Length`. Add `Date` to this list
  when wiring the afterHandle — replays should never carry a stale `Date`.

## Out of Scope

- Per-row idempotency keys in domain tables (the `(chat_id, idempotency_key)`
  lookup in `swipe-race-insert.ts` stays).
- Migrating legacy routes through `handleApiRequest` to use this middleware
  (the legacy dispatcher handles its own request-id resolution; adding
  idempotency there is a separate ticket).
- Backing the memory cache with Redis (separate ticket if multi-instance prod
  is on the roadmap before the table backend is solid).


## Review Update (2026-08-27)

The epic marked this done, but the AC is **not met**: `idempotent({ backend: "table", asyncStore })` behaves identically to `memory` — the `table` backend is unimplemented and `asyncStore` is a dead parameter. See `BUG-middleware-idempotency-table-backend-unimplemented.md` and `BUG-middleware-idempotency-orphaned-slot-permanent-409.md`. Status stays ⬜ Open.


## Resolution (2026-08-27)

Fixed in worktree `merge-review-followups`: `table` backend replaced by a memory-only fallback with `console.warn` (dead `asyncStore` param removed), and the in-flight idempotency slot is released on handler throw (no permanent 409). ACs met. See `BUG-middleware-idempotency-table-backend-unimplemented.md` and `BUG-middleware-idempotency-orphaned-slot-permanent-409.md` (both resolved).
