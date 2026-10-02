<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Login & Authentication UI

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

Frontend implementation for Login & Authentication UI. See `docs/frontend/login.md` for UX specification.

## Scope

_TBD — expand with frontend implementation tasks._

## Related Epics

- `docs/frontend/login.md`

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

