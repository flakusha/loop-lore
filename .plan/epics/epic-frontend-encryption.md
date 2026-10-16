<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Encryption UI

**Effort:** Medium
**Type:** epic
**Tags:** frontend, encryption, crypto, security
**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** browser crypto + send path built; receive-decrypt + key-management UI pending
**Priority:** Medium

## Summary

Frontend implementation for Encryption UI. See `docs/frontend/encryption.md` for UX specification.

## Scope

_TBD — expand with frontend implementation tasks._

## Security Considerations

- **Session-bound key material reused after the session ends** → re-check capability at use time (src/frontend/browser-crypto.ts:47-113)
- **Two tabs unlock/enroll the same user key concurrently** → unique constraint + retry (src/components/key-management.html)
- **Unlock surface trusts a cached key without re-authorizing the session** → re-check consent/authorization after reservation (src/components/key-management.html)
- **Gallery decrypt path trusts the asset id supplied by the client (IDOR)** → re-check capability at use time (epic Integration Points: Frontend Gallery decrypt path)

## Related Epics

- `docs/frontend/encryption.md`

- `epic-encryption-workflow.md` — related
- `epic-frontend-gallery.md` — related
- `epic-frontend-login.md` — related

## Tickets

_TBD — create implementation tickets._

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Login & Authentication UI | Session identity + unlock surface | Key material is session-bound |
| Frontend Gallery | Private asset preview | Decrypt for preview (gallery refs this epic) |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Frontend Gallery | Client decrypt path | Private image/audio/video preview |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Browser crypto boundary (`src/frontend/browser-crypto.ts`) | Gallery, Login | AES-GCM client encrypt/decrypt |
| Key-management UI (`src/components/key-management.html`) | Login | Unlock/enroll surface |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| — | — | Client-side crypto; no cross-system events |

