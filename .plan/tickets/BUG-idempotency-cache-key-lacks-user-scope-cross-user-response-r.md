# BUG: Idempotency cache key lacks user scope — cross-user response replay

**Status:** [OK] Resolved (worktree fix-idempotency-user-scope)

**Priority:** high

**Effort:** Medium

## Summary

In `src/middleware/idempotency.ts`, `makeKey()` now scopes the cache key by
`userId` (or `anon` for unauthenticated requests) in addition to method, route
pattern, and request id. Two authenticated users sharing the same `X-Request-Id`
header value can no longer replay each other's cached responses. Unauthenticated
requests are scoped to the `anon` bucket and do not collide with any
authenticated user's cached body. The production wiring (`src/elysia-app.ts`)
threads `ctx.userId` through `beforeHandle`, `recordResponse`, and `release`.

## Fix surface

- `src/middleware/idempotency.ts:67-81` — `makeKey` signature includes
  `userId: string | null`; key format `METHOD route userId requestId`.
- `src/middleware/idempotency.ts:146` — `beforeHandle` passes
  `ctx.userId ?? null` into `makeKey`.
- `src/elysia-app.ts:151,158` — production afterHandle forwards
  `ctx.userId ?? null` to `release`/`recordResponse`.

## Acceptance Criteria

- [x] Implementation complete (key includes userId; production wiring threads
  `ctx.userId`)
- [x] Tests passing — 8 unit tests + 12 integration tests. Three new
  cross-user isolation integration tests cover:
  1. Distinct `x-user-id` on the same `X-Request-Id` do not share cache
     (the original BUG scenario).
  2. Replay returns the SAME user's cached body (not another user's).
  3. Unauthenticated requests share the `anon` bucket but never collide
     with an authenticated user's cache.
- [x] Documentation updated — this ticket reflects the resolution; the
  in-code comment at `idempotency.ts:67` references the BUG and explains
  the precedence model.
