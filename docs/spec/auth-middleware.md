<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Auth Middleware

## Implemented

- Two-mode auth: remote multi-user (`config.auth.required = true`, JWT) and solo/demo mode (implicit solo user, lazily created/cached).
- Auth runs as an inline Elysia `.derive()` in `src/elysia-app.ts` **before** all routes/plugins — child plugins don't share derived values, so it cannot be a `.use()` plugin (`src/middleware/elysia-auth.ts` shim was deleted). Context gets `{ userId, userRole, sessionId, ...i18n }`.
- `authenticate()` (`src/middleware/auth/authenticate.ts`): token from `Authorization: Bearer` → `ll_token` cookie; `verifyJwt()` (`src/auth/jwt.ts`) checks `sub`/`sid` against the `sessions` table. Legacy opaque-token fallback (`src/middleware/auth/token.ts`): `sha256(token)` → `sessions.token_hash` for old sessions.
- i18n always injected: `detectLocale` (cookie → Accept-Language) + `createI18nContext`.
- Permissions: `requirePermission()` matrix guard (`src/middleware/permissions.ts` + `src/users/permissions.ts`), localized 403 + denial logging; `adminViewGuard` (`src/middleware/admin-gate.ts`) 302s for `/views/admin/*`; `requireUserId(ctx)` is the canonical 401 helper (`src/routes/http-utils.ts`). Ownership checks migrated to the matrix (2026-08-18); `"*"` roles bypass.
- Rate limiting: in-memory sliding window (`src/middleware/rate-limit.ts`), wired only to auth routes; full subsystem planned (see epic-api-governance).
- Passwords: `Bun.password.hash/verify`. Web token storage: `ll_token` HttpOnly cookie (`SameSite=Lax`, 24h); raw token never stored server-side.
- Account bootstrap: solo user lazy-created; multi-user seeds a bootstrap admin from `AUTH_ADMIN_USERNAME`/`AUTH_ADMIN_PASSWORD` env (never commit); self-registration creates `role=user` only when `registrationOpen=true`.
- Asset signed URLs: HMAC-SHA256 `?token=` with expiry, validated on `/api/assets/:id/download` (needed because `<img>`/`<video>` can't set headers).

## Not implemented / aspirational

- Full rate-limiting subsystem (token bucket, shared store, per-user, dashboard) — `TASK-rate-limit-coverage-expansion`.

## Epics

- `.plan/epics/epic-auth-access.md`
- `.plan/epics/epic-api-governance.md` (rate limiting plans)

## See also

`docs/spec/users-sessions.md`, `docs/spec/api-routes.md`, `src/middleware/auth/`, `src/elysia-app.ts`, `src/auth/jwt.ts`.
