<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Middleware — accept frontend-supplied request id (UUID) + fall back to server-generated

**Status:** ⬜ Open
**Priority:** medium
**Effort:** Small
**Epic:** epic-middleware-request-lifecycle
**Related:** `src/server/handler.ts`, `src/middleware/permissions.ts:89`, `src/routes/messages/reply.ts:48`, `epic-middleware-request-lifecycle.md`
**Issue:** d33734d

## Summary

`src/server/handler.ts:64-66` already generates a server-side UUID via
`crypto.randomUUID()` and stamps it as `X-Request-Id` on every response, so
the generation primitive exists. The work here is **wiring** that value into
Elysia's `.derive()` context and **honoring a client-supplied id first** —
today `handler.ts` unconditionally overwrites any incoming `X-Request-Id`
header before the app sees it. After this ticket, route handlers and
`RequestContext` read `ctx.requestId` from `.derive()` (or equivalent) and
the in-memory `Request` carries the resolved id, with no re-implementation of
the UUID generator.

## Context

- Today the access log line at `src/server/handler.ts` (severity via status,
  `requestId`, method, path, durationMs) is the only consumer; route handlers
  do not see `ctx.requestId` because Elysia's `.derive()` chain does not
  populate it. `src/middleware/permissions.ts:89` reads the header directly
  because no upstream puts it on the context.
- The frontend needs to send a request id so it can correlate the original
  POST with the response, the in-progress status poll (see
  `TASK-middleware-in-progress-status-endpoint.md`), and the server log.
- Server-side generation is still required for untrusted clients (no
  supplied id, malformed UUID, duplicate, or oversized value); the existing
  `crypto.randomUUID()` call in `handler.ts` is reused — do NOT add a second
  generator.
- `src/routes/messages/reply.ts:48` forwards the header to
  `triggerAutoGeneration`; once the new middleware runs first, LLM
  auto-generation naturally inherits the client-supplied id without further
  change.

## Acceptance Criteria

- [ ] New `src/middleware/request-id.ts` exports `requestIdMiddleware()`:
  reads `X-Request-Id` (or `Idempotency-Key` alias) from the request; if
  absent/empty/malformed/oversized (>128 chars) or unsafe (control chars),
  reuse the existing server-side UUID generator path (the one in
  `src/server/handler.ts`) — do NOT introduce a second `crypto.randomUUID()`
  call site. Resolved value is echoed on the response as `X-Request-Id`.
- [ ] Wired into `src/elysia-app.ts` via `.derive()` (or equivalent) BEFORE
  auth and other middleware so `ctx.requestId` is populated for every
  downstream consumer (route handlers, permissions, i18n, idempotency, the
  in-progress middleware). The existing `handler.ts` access-log line keeps
  working unchanged.
- [ ] `src/server/handler.ts` is updated so the server-side UUID path
  respects a valid client-supplied id already on the request — i.e., the
  new Elysia-level middleware runs BEFORE the `handler.ts` mutation that
  overwrites the header, OR `handler.ts` defers to the resolved value from
  the cloned request.
- [ ] The resolved id is exposed on `RequestContext` (extend
  `src/middleware/types.ts` if not already present) so route handlers can
  read it without re-parsing the header — replaces the direct header reads
  at `src/middleware/permissions.ts:89` and `src/routes/messages/reply.ts:48`.
- [ ] Honors `Idempotency-Key` header (alias) as the request id when
  `X-Request-Id` is absent, to keep API consumers from sending two
  separate headers; documents the precedence.
- [ ] Unit tests: client UUID accepted; missing header → generated via the
  shared generator; malformed value → generated; oversized → generated;
  valid id round-trips on response; both header names work; precedence
  correct; `ctx.requestId` is populated for downstream `.derive()` consumers
  and the access log shows the same id that the response carried.
- [ ] `epic-middleware-request-lifecycle.md` sub-ticket checkbox marked done.

## Notes

- Treat the id as untrusted input. Validate length and character set before
  storing; never log the raw value at error severity (it may carry PII the
  client embedded). Log length + a short prefix only.
- If the same id is supplied twice by the same client within the idempotency
  window, that is the responsibility of
  `TASK-middleware-global-idempotency-replay-for-re-fired-requests.md` —
  this ticket is purely the identity/transport layer.
- Do not require the id to be a UUID; an opaque string key is acceptable.
  Validation is "non-empty printable ASCII, ≤128 chars" — generation
  produces UUIDs for ergonomics, but consumer-supplied values can be any
  key the client wants to use for correlation.
- **`src/middleware/rate-limit.ts` is a sliding-window rate limiter keyed
  by IP/client — it is NOT an idempotency layer. Do not modify it as part
  of this ticket; idempotency lives in its own middleware
  (`TASK-middleware-global-idempotency-replay-for-re-fired-requests.md`).**
