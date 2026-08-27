# TASK: Adopt Bun.CSRF for CSRF protection

**Status:** Implemented in `adopt-bun-and-elysia-remaining` worktree (2026-08-27). Smoke/e2e pending.
**Priority:** high
**Effort:** Medium

## Summary

Replace dead CSRF machinery with Bun.CSRF.generate/verify. Stateless, HMAC-signed, double-submit cookie pattern.

## Acceptance Criteria

- [x] Implementation complete (src/middleware/csrf.ts + integration in src/elysia-app.ts + csrfSecret config field)
- [x] Tests passing (41/41 in src/middleware/csrf.test.ts; auth + idempotency suites unaffected)
- [ ] Documentation updated (docs/spec/security/csrf.md absent — follow-up)

## Implementation notes

- `src/middleware/csrf.ts` — pure helpers + `decideCsrf()` over `Bun.CSRF.generate`/`verify`.
  Double-submit cookie pattern bound to sessionId (or `anonymous::<requestId>` when unauthenticated).
  Route exemption table: `/api/auth/login`, `/api/auth/register`, `/api/demo-login`, `/api/auth/logout`.
  Cookie: `csrf_token` non-HttpOnly + `SameSite=Lax` + `Secure` follows env override matrix
  (mirrors `setTokenCookie` in `src/routes/auth/shared.ts`).
- `src/elysia-app.ts` — CSRF block placed between auth derive and idempotency onBeforeHandle.
  Uses `safeJsonStringify` for the 403 body (eslint-enforced). Disabled when both
  `auth.csrfSecret` and `auth.jwtSecret` are empty; falls back to `auth.jwtSecret`.
- Frontend plumbing already existed in `src/frontend/fe-fetch.ts: getCsrfToken()` →
  `safeFetch.auth.csrfToken` → `X-CSRF-Token` header.
- Config: `src/config/schema/auth.ts` + `src/config/sections/auth.ts` gained
  `csrfSecret?: string` (env-only `AUTH_CSRF_SECRET`).

## Deferred to follow-up worktree

- E2E smoke against `bun run smoke-app` for browser round-trip (cookie landing → CSRF header send).
- Documentation in `docs/spec/security/csrf.md`.
- Audit public write endpoints beyond the 4 exempt routes.
- E2E for anonymous binding replay defense.
