<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Encryption UI

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** browser crypto + send path built; receive-decrypt + key-management UI pending
**Priority:** Medium

## Summary

Frontend implementation for Encryption UI. See `docs/frontend/encryption.md` for UX specification.

## Scope

_TBD — expand with frontend implementation tasks._

## Related Epics

- `docs/frontend/encryption.md`

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

