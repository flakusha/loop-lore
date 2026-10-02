<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Headers & Navigation Management

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

Frontend implementation for Headers & Navigation Management. See `docs/frontend/headers-management.md` for UX specification.

## Scope

_TBD — expand with frontend implementation tasks._

## Related Epics

- `docs/frontend/headers-management.md`

## Tickets

_TBD — create implementation tickets._

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Routing | Route table + active route | Nav highlighting, breadcrumbs |
| Frontend Components | Header/nav markup | `src/components/header.html` |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Frontend Overview | Layout header/nav | Hub shell (`src/views/layout.html`) |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Nav state (`src/views/layout.html` + `src/components/header.html`) | Routing | Single source of active-link state |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| — | — | Server-rendered; nav state derived from request path |

