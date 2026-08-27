<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Wire `requestIdMiddleware` into Elysia `.derive()` chain

**Status:** ⬜ Open
**Priority:** high
**Effort:** Small
**Epic:** epic-middleware-request-lifecycle
**Related:**
- `src/middleware/request-id.ts` (existing module — needs wiring)
- `src/elysia-app.ts` (where the wiring goes)
- `src/routes/messages/reply.ts:44,62` (calls `request.headers.get("x-request-id")` directly)
- `src/routes/proactive-messaging/send-handler.ts:69` (same)
- `src/server/handler.ts:42-48` (legacy `resolveRequestId` — keep)
- `TASK-middleware-accept-frontend-supplied-request-id-uuid-with-ser.md` (the partial parent ticket)
- `TASK-middleware-idempotency-wire-into-elysia.md` (this must land first; idempotency reads `ctx.requestId`)
- `TASK-async-store-complete-fail-lifecycle-hooks.md` (depends on `ctx.requestId`)

## Summary

`src/middleware/request-id.ts` ships with `requestIdMiddleware()` (and the lower-level
`resolveRequestId` / `applyRequestId` helpers `handler.ts` already uses), but the
Elysia-side `.derive()` chain in `src/elysia-app.ts` does NOT call it. Migrated route
modules therefore read `request.headers.get("x-request-id")` directly, bypassing
validation, length caps, and the server-side `crypto.randomUUID()` fallback that
the legacy `handler.ts` path provides. This ticket closes the wiring gap and
removes the direct header reads.

## Context

Verified state on `dev` at HEAD:

- `src/elysia-app.ts:50-95` builds the Elysia app chain with `.onError()` + auth
  `.derive()` + `versionResolver()` + `registerPlugins()` + `v1Routes()`. No
  call to `requestIdMiddleware`.
- `src/routes/messages/reply.ts:44` reads the raw header:
  `const requestId = request.headers.get("x-request-id") ?? undefined`. Same
  on line 62.
- `src/routes/proactive-messaging/send-handler.ts:69` does the same.
- `src/server/handler.ts:42` uses the lower-level `resolveRequestId(request.headers,)`,
  which DOES run validation + fallback. Legacy routes are fine; migrated routes
  are not.

The middleware module itself already exports everything needed
(`requestIdMiddleware`, `resolveRequestId`, `applyRequestId`, `isValidRequestId`),
and the unit tests cover it. The work is wiring + call-site replacement.

## Acceptance Criteria

- [ ] `src/elysia-app.ts` adds a `.derive(requestIdMiddleware())` step BEFORE
      the auth `.derive()` and AFTER `versionResolver()`. The middleware must
      set `x-request-id` on the in-memory `Request` headers (so existing
      `request.headers.get("x-request-id")` reads continue to work) AND
      populate `ctx.requestId`.
- [ ] `RequestContext` (extended in `src/middleware/types.ts` if not already)
      carries `requestId: string` so route handlers can read `ctx.requestId`
      without re-parsing headers.
- [ ] `src/routes/messages/reply.ts:44,62` replaces direct header reads with
      `ctx.requestId` (or the function arg already has the request — pick the
      cleaner path). Same for `src/routes/proactive-messaging/send-handler.ts:69`.
- [ ] `src/server/handler.ts:42-48` keeps its own `resolveRequestId(...)` path
      for legacy `handleApiRequest` dispatch (do not regress it). The two
      paths compose: legacy uses `handler.ts`, migrated uses Elysia.
- [ ] Add an integration test in `tests/e2e/` (or `src/middleware/request-id.integration.test.ts`):
      - migrated route returns the same `X-Request-Id` the client sent (when valid),
      - migrated route generates a UUID via `crypto.randomUUID()` when the header
        is missing,
      - migrated route generates a UUID when the supplied id is malformed
        (control chars, oversized),
      - the `Idempotency-Key` alias works,
      - `ctx.requestId` is populated for handlers downstream of the derive.
- [ ] `epic-middleware-request-lifecycle.md` sub-ticket status updates.

## Notes

- Re-running the middleware twice (once in `handler.ts`, once in Elysia) is fine
  because the Elysia `Request` is a separate object from the one `handler.ts`
  clones. The header mutation is local to the Elysia-side `Request`.
- The auth `.derive()` runs AFTER the request-id `derive()` so `authenticate(...)`
  can correlate the resolved id in its own log line if it wants to.
- Do NOT touch `src/middleware/rate-limit.ts`.
- This ticket is a pure wiring task — no logic changes to the request-id
  module.

## Out of Scope

- Removing `handler.ts`'s `resolveRequestId` (legacy routes still need it).
- Adding the `Idempotency-Key` alias handling to `handler.ts` (it's already
  in the Elysia middleware; `handler.ts` reads `X-Request-Id` directly).
