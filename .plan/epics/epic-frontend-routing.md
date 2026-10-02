<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Client-Side Routing

**Effort:** Medium
**Type:** epic
**Tags:** (none)
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Medium

## Summary

Frontend implementation for Client-Side Routing. See `docs/frontend/routing.md` for UX specification.

## Scope

_TBD — expand with frontend implementation tasks._

## Related Epics

- `docs/frontend/routing.md`

## Tickets

_TBD — create implementation tickets._

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Headers & Navigation Management | Header/nav active-state + breadcrumb contract | Route changes update nav state (see `matrix-frontend-backend-integration.md` FB5) |
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

