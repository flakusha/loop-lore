<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Client-Side Routing

**Effort:** Medium
**Type:** epic
**Tags:** frontend, routing, ui, htmx
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

Frontend implementation for Client-Side Routing. See `docs/frontend/routing.md` for UX specification.

## Scope

_TBD — expand with frontend implementation tasks._

## Security Considerations

- **Route guard expressed only in client router state / hidden nav links** → re-check capability at use time (src/frontend/pages.ts;`TASK-DEFINE-SHARED-NAV-STATE-CONTRACT-BETWEEN-CLIENT-SIDE-ROUTING`)
- **htmx history restore replays a protected URL after logout without a server check** → re-check capability at use time (Cross-System Events: htmx history events)

## Related Epics

- `docs/frontend/routing.md`

- `epic-frontend-bundle-optimization.md` — related
- `epic-frontend-components.md` — related
- `epic-frontend-headers-management.md` — related

## Tickets

_TBD — create implementation tickets._

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Headers & Navigation Management | Header/nav active-state + breadcrumb contract | Route changes update nav state |
| Frontend Components | Page-level components | Rendered per route |
| Bundle Optimization | Per-route code-splitting | Lazy page bundles per route |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Headers & Navigation Management | Route table | Active link / history |
| Frontend Overview | Route index | Hub navigation |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Page bundle entry (`src/frontend/pages.ts`, `src/frontend/pages/*`) | Bundle Optimization | Code-split boundary per route |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| htmx `history` events | subscribes | Push/restore URL state on swaps |

