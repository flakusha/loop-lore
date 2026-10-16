<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Login & Authentication UI

**Effort:** Medium
**Type:** epic
**Tags:** frontend, auth, security, rate-limiting
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

Frontend implementation for Login & Authentication UI. See `docs/frontend/login.md` for UX specification.

## Scope

_TBD — expand with frontend implementation tasks._

## Security Considerations

- **Concurrent register POSTs collide on the same username** → unique constraint + retry (src/routes/auth/register.ts:141-163)
- **Per-process in-memory login/register buckets let N instances multiply attempts** → conditional UPDATE … WHERE on a shared counter row (src/routes/auth/shared.ts:31-44)
- **Session JWT stays valid after logout or role change** → re-check capability at use time (src/routes/auth/session.ts:35)

## Related Epics

- `docs/frontend/login.md`

- `epic-auth-access.md` — related
- `epic-frontend-age-gate.md` — related
- `epic-frontend-encryption.md` — related

## Tickets

_TBD — create implementation tickets._

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Auth & Access | Login routes + session/token model | `src/routes/auth/` |
| Encryption UI | Key unlock / passphrase surface | Session-bound key material |
| Age Gate | Entry verification gate | Pre-auth or per-session |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Admin Panel | Session identity | Revoke/reset/disable actions |
| Encryption UI | Authenticated session | Unlock key material |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Auth form fields (`src/components/auth-form-fields.html`) | Register/Age Gate | Shared credential inputs |
| Session cookie/token | Encryption UI, Admin | Identity binding |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| — | — | Server-rendered auth form; redirects only |

