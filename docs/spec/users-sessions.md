# Users, Roles & Sessions

## Overview

loop-lore supports two session models:

1. **Remote multi-user** — authenticated users with roles, simultaneous sessions
2. **Local demo/solo** — single-user mode, no auth required, HTTP or HTTPS

Both models share the same underlying session storage and message handling. The difference is the authentication layer.

## User Model

Full table definition in `src/db/schema-core.ts` → `Users` interface.

**Key fields:**

- `id` — UUID (primary key)
- `username` — string (unique)
- `display_name` — string
- `password_hash` — string (nullable for demo users, hashed with scrypt)
- `role` — `UserRole` (admin | user | viewer | solo)
- `settings` — JSON (preferences, UI config)
- `birth_date` — string (nullable, ISO date — age gate)
- `age_gate_accepted_at` — string (nullable, ISO timestamp — age gate)
- `created_at` — timestamp
- `last_seen_at` — timestamp

Password hashing: **scrypt** (native Bun `Bun.password.hash`). No bcrypt/argon2 deps for MVP.

### Roles

| Role     | Permissions                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`  | Full access. Manage users, system config, view all messages/stats.                                                                                |
| `user`   | Standard. Create/manage own chats, characters, assets. View own message stats.                                                                   |
| `viewer` | Read-only. View assigned chats, no editing.                                                                                                        |
| `solo`   | Implicit role for local demo mode. Instance owner — admin-equivalent (user mgmt, system + age-gate config) within the single-user instance. |

### Role-Based Feature Access

| Feature                                  | admin | user   | viewer | solo |
| ---------------------------------------- | ----- | ------ | ------ | ---- |
| Create chats                             | ✓     | ✓      |        | ✓    |
| Edit messages                            | ✓     | own    |        | ✓    |
| Delete messages                          | ✓     | own    |        | ✓    |
| Hide messages (soft-delete)              | ✓     | own    |        | ✓    |
| View message stats (tokens, cost, speed) | all   | own    |        | ✓    |
| Manage users                             | ✓     |        |        | ✓    |
| System config                            | ✓     |        |        | ✓    |
| Configure age gate                       | ✓     |        |        | ✓    |
| View docs (hidden sections)              | all   | public | public | all  |

## Session Model

Full table definition in `src/db/schema-core.ts` → `Sessions` interface.

### Remote Multi-User Sessions

- Session token stored in DB (not in-memory) — survives server restart
- Token: [REDACTED:API key param] UUID + SHA-256 hash** (no JWT for MVP). The UUID is the bearer token; only its SHA-256 hash is stored in DB.
- Multiple simultaneous sessions per user allowed (configurable max)
- Session timeout configurable (default: 24h idle)
- Web clients carry the token in the `ll_token` HttpOnly cookie; API clients may
  use `Authorization: Bearer [REDACTED:Authorization header]
- **Not implemented:** there is no `/api/sessions` list endpoint and no remote
  force-logout. Logout (`/api/auth/logout`) only deletes the caller's own session.

### Rate Limiting

Applied per-IP to auth endpoints:

| Endpoint                  | Rate Limit      |
| ------------------------- | --------------- |
| `POST /api/auth/login`    | 10 requests/min |
| `POST /api/auth/register` | 3 requests/hr   |

Rate limit headers returned: `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
On violation: `429 Too Many Requests` with `ErrorCode.TOO_MANY_REQUESTS`.

### Local Demo / Solo Sessions

- No authentication required — `auth.required = false`
- Single implicit user (role: `solo`)
- Session created on first request, persisted in DB
- Works over HTTP or HTTPS (cert config optional)
- Auto-creates demo data on first run (sample character, welcome chat)
- **No permission checks** — solo user has full access within own session
- **Demo → Live switch not supported** — changing `auth.required` mid-session breaks DX

## HTTPS Support

- Local HTTPS via self-signed cert (auto-generated on first run via OpenSSL, falls back gracefully)
- Remote HTTPS via reverse proxy (recommended) or bun's TLS options
- Config: `TLS_KEY` / `SERVER_TLS_KEY`, `TLS_CERT` / `SERVER_TLS_CERT` env vars or `server.tls.key`/`server.tls.cert` in config file
- Auto-generation runs when cert files are missing and OpenSSL is available
- HTTPS port: HTTP port + 443 (e.g., HTTP on 3000, HTTPS on 3443)

## Multi-User Setup (Distributed)

### Option 1: Single process + SQLite (light multi-user)

- One Bun process handles all users
- SQLite with WAL mode for concurrent reads
- Suitable for small groups (5-20 users)

### Option 2: Single process + Postgres (medium scale)

- Same architecture, swap adapter to Postgres
- Better concurrent write performance

### Option 3: Containerized + reverse proxy (production)

- Each Bun instance behind nginx/caddy
- Postgres/MySQL backend
- Redis for session cache (optional)
- Horizontal scale via additional Bun workers

## Configuration

Config keys defined in `src/config/schema.ts` → `AuthConfig`.

Env overrides:

```env
AUTH_REQUIRED=true                  # true=multi-user, false=demo/solo
AUTH_REGISTRATION_OPEN=true         # allow /api/auth/register (must be enforced)
SESSION_TIMEOUT_HOURS=24            # idle session timeout
SESSION_MAX_PER_USER=10             # max simultaneous sessions (not yet enforced)
AUTH_ADMIN_USERNAME=admin           # bootstrap admin username (multi-user)
AUTH_ADMIN_PASSWORD=<secret>        # bootstrap admin password (env-only)
AUTH_DEMO_USERNAME=demo             # solo user's username (demo mode)
```

## Account Seeding

`src/db/seed.ts` seeds the default Assistant actor and demo solo user (if no admin exists):
- **Solo/demo:** `solo` user created on first run or `/api/demo-login`
  (username = `auth.demoUsername`). It is the instance owner (admin-equivalent).
- **Multi-user:** a bootstrap admin is seeded from
  `AUTH_ADMIN_USERNAME` / `AUTH_ADMIN_PASSWORD` when no admin exists (idempotent).
- **Self-service:** users register via `/api/auth/register` when
  `auth.registrationOpen=true`; new accounts get `role=user` (never admin).

Auth endpoints documented in `docs/spec/api-routes.md`.
Rate limiting: per-IP, hardcoded in middleware for MVP (see `docs/spec/auth-middleware.md`).