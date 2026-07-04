# Users, Roles & Sessions

## Overview

loop-lore supports two session models:

1. **Remote multi-user** — authenticated users with roles, simultaneous sessions
2. **Local demo/solo** — single-user mode, no auth required, HTTP or HTTPS

Both models share the same underlying session storage and message handling. The difference is the authentication layer.

## User Model

Full table definition: [`docs/schema.md`](./schema.md#table-users).

### Fields

```
User {
  id:           UUID (primary)
  username:     string (unique)
  displayName:  string
  passwordHash: string (nullable for demo users)
  role:         UserRole
  settings:     JSON (preferences, UI config)
  birthDate:    string (nullable, ISO date — age gate)
  ageGateAcceptedAt: string (nullable, ISO timestamp — age gate)
  createdAt:    timestamp
  lastSeenAt:   timestamp
}
```

### Roles

| Role     | Permissions                                                                    |
| -------- | ------------------------------------------------------------------------------ |
| `admin`  | Full access. Manage users, system config, view all messages/stats.             |
| `user`   | Standard. Create/manage own chats, characters, assets. View own message stats. |
| `viewer` | Read-only. View assigned chats, no editing.                                    |
| `solo`   | Implicit role for local demo mode. All permissions within own session.         |

### Role-Based Feature Access

| Feature                                  | admin | user   | viewer | solo |
| ---------------------------------------- | ----- | ------ | ------ | ---- |
| Create chats                             | ✓     | ✓      |        | ✓    |
| Edit messages                            | ✓     | own    |        | ✓    |
| Delete messages                          | ✓     | own    |        | ✓    |
| Hide messages (soft-delete)              | ✓     | own    |        | ✓    |
| View message stats (tokens, cost, speed) | all   | own    |        | ✓    |
| Manage users                             | ✓     |        |        |      |
| System config                            | ✓     |        |        |      |
| Configure age gate                       | ✓     |        |        |      |
| View docs (hidden sections)              | all   | public | public | all  |

## Session Management

### Remote Multi-User Sessions

- Session token stored in DB (not in-memory) — survives server restart
- Token: signed JWT or opaque UUID with server-side lookup
- Multiple simultaneous sessions per user allowed (configurable max)
- Session timeout configurable (default: 24h idle)
- Sessions visible to user: `/api/sessions` lists active sessions
- Force-logout remote session from session list

### Local Demo / Solo Sessions

- No authentication required
- Single implicit user (role: solo)
- Session created on first request, persisted in DB
- Works over HTTP or HTTPS (cert config optional)
- Auto-creates demo data on first run (sample character, welcome chat)

### Session Storage

```
Session {
  id:           UUID
  userId:       UUID (nullable for anonymous/demo)
  token:        string (hashed)
  ip:           string
  userAgent:    string
  createdAt:    timestamp
  lastActivity: timestamp
  expiresAt:    timestamp
  metadata:     JSON (extra context)
}
```

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

```env
# Session config
SESSION_MAX_PER_USER=10
SESSION_TIMEOUT_HOURS=24
SESSION_SECRET=change-me-to-random-string

# Auth
AUTH_REQUIRED=true                  # false = demo/solo mode
AUTH_REGISTRATION_OPEN=true         # allow new user registration

# Age gate / verification
AGE_GATE_ENABLED=false              # true = users must verify age
AGE_GATE_MINIMUM_AGE=18             # minimum age requirement
AGE_GATE_MODE=self-declaration      # none | self-declaration | verification

# TLS (auto-generated self-signed if files missing)
TLS_KEY=./data/certs/key.pem
TLS_CERT=./data/certs/cert.pem

# Demo mode
DEMO_MODE=true                      # skip auth, create solo user
DEMO_USERNAME=demo
DEMO_AUTO_SETUP=true                # create sample data on first run
```
