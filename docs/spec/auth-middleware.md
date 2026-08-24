<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# Auth Middleware

## Overview

Two-mode authentication system:

1. **Remote multi-user** — `config.auth.required = true`. JWT Bearer token →
   `verifyJwt()` → sessions table lookup. Supports admin/user/viewer/solo roles.
2. **Solo/demo mode** — `config.auth.required = false`. No token check. Implicit
   solo user looked up once and cached.

## Auth Flow

Every request passes through the Elysia `.derive()` block in `src/elysia-app.ts`,
which runs `authenticate()` **before** all route handlers and plugin
registration. The derive block returns `{ userId, userRole, sessionId, ...i18n }`
into the Elysia context for every downstream route.

**Step 1: Authenticate** (`src/middleware/auth/authenticate.ts`)

- `authenticate({ request, database, authConfig })` returns either:
  - `{ context: RequestContext }` on success, or
  - `jsonError({ status: 401 })` Response on required-auth failure
- Token extraction priority: `Authorization: Bearer <token>` header → `ll_token`
  cookie.
- JWT verification via `verifyJwt()` (`src/auth/jwt.ts`). If `authConfig.jwtSecret`
  is unset, warns and falls back to solo mode.
- JWT payload `sub` → user ID; `sid` → session ID. Session validity checked
  against `sessions` table (`expires_at`).
- **Legacy opaque-token fallback**: `src/middleware/auth/token.ts` still resolves
  `sha256(token)` → `sessions.token_hash` for older sessions. New logins use JWT.

**Step 2: Solo fallback** (when `authConfig.required === false`)

- `getOrCreateSoloUserForAuth()` lazily creates/caches the solo user.
- Returns `{ userId, userRole: UserRole.Solo, sessionId: null }`.

**Step 3: i18n context** (always, including auth-failure path)

- `detectLocale(request)` — Cookie (`ll_locale`) → Accept-Language → default.
- `createI18nContext(locale)` — loads translations, builds `t` translator fn.
- Spread into context alongside auth fields.

**Step 4: Route handler dispatch**

- Route handlers receive `ctx.userId` / `ctx.userRole` / `ctx.sessionId` / `ctx.t`.
- When `userId === null`, route handlers return 401 via `requireUserId(ctx)`
  (`src/routes/http-utils.ts`) or `unauthorizedResponse()`.

> **Note:** Auth runs as an inline Elysia `.derive()`, **not** a `.use()` plugin.
> Reason: Elysia child plugins don't share derived values with sibling route
> plugins — inlining on the root app ensures `userId` propagates everywhere.
> `src/middleware/elysia-auth.ts` exports an `authGuard()` plugin for backward
> compatibility / unit tests, but production wiring is inline in `elysia-app.ts`.

## Token Format

**JWT (primary)** — signed with `authConfig.jwtSecret`. Payload: `{ sub: userId,
sid: sessionId, ... }`. Verified per request via `verifyJwt()`.

**Legacy opaque token (fallback)** — UUID v4 string, SHA-256 hashed, stored in
`sessions.token_hash`. `resolveUserIdFromRequest()` in `auth/token.ts` still
checks this path for older sessions.

```
Client:    Authorization: Bearer <jwt-or-opaque-token>
Server:    try verifyJwt(token, jwtSecret) → { sub, sid }
           → fetch user + session, check expires_at
           fallback (legacy): sha256(token) → SELECT sessions WHERE token_hash = ?
```

## Permission System

### Role-based guards (matrix-driven)

`src/middleware/permissions.ts` exports `requirePermission(permission,
opts?)` — an Elysia `beforeHandle` factory that:

- Calls `can(ctx.userRole, permission)` (`src/users/permissions.ts`).
- On denial: returns localized 403 via `jsonError()` + `ctx.t()`.
- Auto-logs denial with `{ userId, handle, requestId, permission, method, path }`
  for security forensics (lazy handle resolution via `HandleResolver`).

Usage:

```typescript
.guard({ beforeHandle: requirePermission("admin.settings") }, (app) => ...)
```

### Admin view guard

`src/middleware/admin-gate.ts` exports `adminViewGuard(ctx)` — for `/views/admin/*`
HTML routes. Returns 302 redirect to `/` on denial (non-disruptive page-nav UX).

### Ownership/access control

Per-resource ownership checks migrated to the permission matrix via
`TASK-ownership-access-control-refactor` (done 2026-08-18). Roles holding `"*"`
(admin/solo/tester) bypass ownership checks via `admin.{chat,character,world}`
perms. See `src/users/permissions.ts` for the full matrix.

### 401 guard helper

`src/routes/http-utils.ts` exports `requireUserId(ctx)` — the canonical
"require authenticated user" helper. Localized via `ctx.t?.("errors.unauthorized")
?? "Unauthorized"`. See `TASK-unify-401-guard-helpers` (done).

## Rate Limiting

`src/middleware/rate-limit.ts` — in-memory sliding-window rate limiter
(`createRateLimiter({ windowMs, maxRequests })`). General-purpose, but
currently only wired to auth routes (`src/routes/auth/shared.ts`,
`src/routes/auth/login.test.ts`).

Per-IP buckets; prunes stale entries every 2× window. Not applied to
authenticated routes — see `TASK-rate-limit-coverage-expansion` and
`epic-api-governance` for the planned full rate-limiting subsystem
(token bucket, Redis/SQLite store, per-user, burst, dashboard).

## Session Management Routes

| Method | Path                 | Auth | Description                                                         |
| ------ | -------------------- | ---- | ------------------------------------------------------------------- |
| POST   | `/api/auth/login`    | No   | Authenticate, get token                                             |
| POST   | `/api/demo-login`    | No   | Solo/demo login (no password, `auth.required=false`)                |
| POST   | `/api/auth/register` | No   | Create account — **gated on `auth.registrationOpen`** (`role=user`) |
| POST   | `/api/auth/logout`   | Yes  | Delete current session                                              |
| GET    | `/api/auth/me`       | Yes  | Current user profile                                                |

### POST /api/auth/register

Validation:

- Username: 3-32 chars, alphanumeric + underscore, unique
- Display name: 1-64 chars
- Password: 8+ chars
- Reject if `auth.registrationOpen === false`

Response: `200 OK` + `Set-Cookie: ll_token` (HttpOnly) + `HX-Redirect: /views/chat` — auto-login after register. Must return an error when `auth.registrationOpen === false`.

### POST /api/auth/logout

No body. Deletes current session (looked up from Authorization header →
token_hash → sessions row).

### GET /api/auth/me

Returns current user profile.

## Security Considerations

### Password Storage

- Bun's native `Bun.password.hash` / `Bun.password.verify` (scrypt via Bun, not
  Node `crypto.scryptSync`)
- Never log passwords or password hashes

### Token Storage

- Client (web): `ll_token` HttpOnly cookie (`SameSite=Lax`, `Path=/`, 24h
  max-age), set by login/demo-login/register. HttpOnly keeps it out of JS.
- Client (API/programmatic): may send the raw token via `Authorization: Bearer`
  header instead of the cookie.
- Server (JWT): signed token verified via `verifyJwt()`; `jwtSecret` from config.
- Server (legacy opaque): SHA-256 hash in `sessions.token_hash` — raw token never
  stored.
- Token never appears in URL query params (except asset signed URLs).

### Signed URLs (Asset Downloads)

Short-lived HMAC-signed URLs for protected asset downloads. Required because
browser `<img src>` and `<video>` tags can't set custom Authorization headers.

Token format: `?token=<HMAC-SHA256(assetId + expiry + secret)>`

Server validates on `/api/assets/:id/download`:

1. Parse token from query param
2. Recompute HMAC with server secret
3. Check expiry timestamp
4. If valid → stream file; else → 401

## Configuration

```jsonc
// config.json
{
  "auth": {
    "required": false, // true = remote auth, false = solo/demo
    "registrationOpen": true, // allow new user registration
    "jwtSecret": null, // JWT signing secret (multi-user mode). Fallback: solo mode.
    "sessionTimeoutHours": 24, // idle session expiry
    "maxSessionsPerUser": 10, // concurrent session limit
    "adminUsername": "admin", // bootstrap admin (multi-user mode)
    "adminPassword": null, // bootstrap admin password (env-only, never commit)
    "demoUsername": "demo", // solo user's username (demo mode)
  },
}
```

## Account Bootstrapping

Seeding (`src/db/seed.ts`) creates **only the default Assistant actor** — no
human accounts are seeded there. Human accounts are created as follows:

| Mode                         | How the first account appears                                                                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Solo/demo (`required=false`) | The `solo` user is created lazily on first request / `/api/demo-login` (`getOrCreateSoloUserForAuth`). Treated as instance owner (admin-equivalent).                                                                                                                                   |
| Multi-user (`required=true`) | A bootstrap **admin** is seeded on startup from `AUTH_ADMIN_USERNAME` + `AUTH_ADMIN_PASSWORD` when no admin exists yet. Idempotent — skipped if any admin row is present. Without these env vars and with `registrationOpen=false`, the instance has no way to create the first admin. |
| Multi-user, self-service     | Users self-register via `/api/auth/register` (only when `registrationOpen=true`), created with `role=user`. Registration never grants admin.                                                                                                                                           |

Env overrides:

```shell
AUTH_ADMIN_USERNAME=admin      # bootstrap admin username (multi-user)
AUTH_ADMIN_PASSWORD=<secret>   # bootstrap admin password — set via env only
```

## See Also

- [Users, Roles & Sessions](./users-sessions.md)
- [API Route Contract](./api-routes.md) — auth routes
- `src/middleware/auth/` — auth middleware barrel (`authenticate.ts`, `token.ts`,
  `solo-user.ts`, `types.ts`)
- `src/middleware/permissions.ts` — `requirePermission()` role/permission guard
- `src/middleware/admin-gate.ts` — `adminViewGuard` for HTML admin views
- `src/middleware/rate-limit.ts` — sliding-window rate limiter
- `src/elysia-app.ts` — auth + i18n wiring via Elysia `.derive()`
- `src/auth/jwt.ts` — `verifyJwt()` / JWT signing
