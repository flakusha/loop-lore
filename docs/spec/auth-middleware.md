# Auth Middleware

## Overview

Two-mode authentication system:

1. **Remote multi-user** — `config.auth.required = true`. Bearer token → SHA-256
   hash → sessions table lookup. Supports admin/user/viewer roles.
2. **Solo/demo mode** — `config.auth.required = false`. No token check. Implicit
   solo user looked up once and cached.

## Auth Flow (MVP)

Every request to `handleApiRequest()` follows this decision journey:

**Step 1: Check auth-skip paths**

- If path is one of `login`, `demo-login`, `register`, `age-gate/*`, or asset signed URLs:
  - Route directly via `compose([errorBoundary], handler)` — no auth, no
    pipeline
  - Jump straight to handler execution
- Otherwise, continue to step 2

**Step 2: Authenticate**

- Call `authenticate(request)` which:
  1. Extracts `Authorization: Bearer <token>` header
  2. SHA-256 hashes the token
  3. Looks up `sessions` table by `token_hash`
  4. If not found or expired → returns `401 Unauthorized`
  5. Fetches user role, updates `last_activity`
  6. Returns `RequestContext { userId, userRole, sessionId }`

**Step 3: Execute middleware chain**

- `compose([errorBoundary], handler)(request, context)`
- Route handler receives validated context, processes the request

### Auth as pre-step (MVP)

`authenticate()` runs **before** the middleware pipeline. Reason: auth-skip
paths bypass the entire auth + pipeline step, not just the token check. If we
folded auth into the pipeline, auth middleware would need path-matching logic to
skip itself — more complexity for marginal gain.

### Future: Auth as middleware

When role guards, rate limiters, and audit logging are needed:

```typescript
compose([errorBoundary, rateLimiter, authenticate, requireRole("admin",),], dispatchRoutes,);
```

## Token Format

Opaque UUID v4 string. Server-side:

- On login: generate UUID → SHA-256 hash → store hash in `sessions.token_hash`
- Return raw UUID to client via `ll_token` HttpOnly cookie (or accept it as a Bearer token)
- On request: SHA-256(raw token) → lookup `sessions` by hash

```
Client:    Authorization: Bearer 550e8400-e29b-41d4-a716-446655440000
Server:    hash = sha256("550e8400-...") → "a1b2c3..."
           SELECT * FROM sessions WHERE token_hash = "a1b2c3..."
```

Benefits over JWT:

- No key management
- Session revocation = DELETE row (immediate)
- No token payload size limits
- Simpler to implement

Trade-off: DB lookup per request. Acceptable for MVP. Can add JWT layer later
via session cache.

## Session Model

### Creation (login)

```http
POST /api/auth/login
Content-Type: application/x-www-form-urlencoded

username=alice&password=...
```

Server:

### Validation (every request)

`authenticate()` does:

### Expiration

- Configurable: `auth.sessionTimeoutHours` (default 24h)
- Checked on every request — expired session deleted lazily
- No periodic cleanup for MVP. Future: background sweep every N minutes

## RequestContext

- `userId` / `sessionId` are `null` only in solo/demo mode before any auth runs
- `userRole` is `null` before auth, then populated with actual role
- Solo mode: `userId` = solo user's UUID, `userRole = "solo"`,
  `sessionId = null`

## Solo/Demo Mode

When `config.auth.required = false`:

1. No Authorization header needed
2. Single implicit user (role: `solo`)
3. User looked up by `WHERE role = "solo"` — created on first request if missing
4. In-memory cache after first lookup (reset for testing via
   `resetSoloUserCache()`)
5. Race-safe creation: duplicate insert is caught by unique constraint on role,
   re-fetch resolves

6. **Solo user is the instance owner.** In demo/solo mode the single `solo`
   user is treated as admin-equivalent: it has full access to user management,
   system config, and age-gate config. There is no separate admin in this mode.

## Role Guard

### Planned middleware (post-MVP)

### Current (MVP)

Inline checks in route handlers:

### Permission matrix

| Action                  | admin | user | viewer | solo |
| ----------------------- | :---: | :--: | :----: | :--: |
| Create chats            |   ✓   |  ✓   |        |  ✓   |
| Read own chats          |   ✓   |  ✓   |   ✓    |  ✓   |
| Read any chat           |   ✓   |      |        |  ✓   |
| Send messages           |   ✓   |  ✓   |        |  ✓   |
| Edit own messages       |   ✓   |  ✓   |        |  ✓   |
| Delete own messages     |   ✓   |  ✓   |        |  ✓   |
| Manage users            |   ✓   |      |        |  ✓   |
| View age gate config    |   ✓   |      |        |  ✓   |
| Modify age gate config  |   ✓   |      |        |  ✓   |
| View system config      |   ✓   |      |        |  ✓   |
| Modify system config    |   ✓   |      |        |  ✓   |
| List active generations |   ✓   |      |        |  ✓   |
| Override message status |   ✓   |      |        |  ✓   |

## Rate Limiting (MVP)

### Login throttle

Simple per-IP in-memory counter:

Logic:

1. On POST `/api/auth/login`: get client IP from `X-Forwarded-For` or
   `request.ip`
2. Look up bucket for IP
3. If outside window → reset bucket
4. If count >= MAX_ATTEMPTS → return 429 Too Many Requests
5. Increment count, proceed

Rate limiter is only on login — not on authenticated routes. Simple, no external
dependency.

### Registration throttle

Same mechanism, separate bucket, lower limit (e.g., 3 per hour per IP).

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

Returns:

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
- Server: SHA-256 hash in `sessions.token_hash` — raw token never stored
- Token never appears in URL query params (except asset signed URLs)

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

```env
AUTH_ADMIN_USERNAME=admin      # bootstrap admin username (multi-user)
AUTH_ADMIN_PASSWORD=<secret>   # bootstrap admin password — set via env only
```

## See Also

- [Users, Roles & Sessions](./users-sessions.md)
- [API Route Contract](./api-routes.md) — auth routes
- `src/middleware/auth.ts` — implementation
- `src/middleware/pipeline.ts` — middleware chain
