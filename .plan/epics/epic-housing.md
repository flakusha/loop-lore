<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Housing System

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Type:** Feature Epic
**Tags:** housing, base-building, neighborhood, decoration, storage, crafting, companion, frontend

## Summary

The **Housing System** is an independent gameplay domain covering player housing, base building, decoration, storage, crafting stations, neighborhoods, and companion housing. It is a standalone epic — **not bound to the main narrative or NSFW narrative**.

## Relationship to Other Domains

Housing interacts with other systems (RPG stats, crafting, economy, companion, NSFW private spaces) but owns its own full lifecycle: backend → API → frontend. It must NOT be folded into any other epic as a sub-feature.

| Facet             | Domain              | Notes                                            |
| ----------------- | ------------------- | ------------------------------------------------ |
| Base building     | Housing             | Construction, rooms, furniture, decoration       |
| Neighborhood      | Housing + Social    | Region clusters, shared spaces, contests         |
| Companion housing | Housing + Companion | Stables, pet rooms, animal pens                  |
| Crafting stations | Housing + Crafting  | Home forge, alchemy, workbench                   |
| Private spaces    | Housing + NSFW      | Bedroom/bath comfort bonuses for NSFW encounters |
| Frontend UI       | Housing             | Dedicated housing UI — separate from NSFW UI     |

## Domain Structure

```
src/rpg/housing/          # housing mechanics (backend, not yet implemented)
src/routes/housing.ts     # housing API (/api/housing/*) (not yet implemented)
src/db/schema-housing.ts  # housing tables (not yet implemented)
src/frontend/alpine/housing.ts  # housing UI (frontend)
```

> **Backend status:** `src/routes/housing.ts`, `src/db/schema-housing.ts`, and `src/rpg/housing/` do NOT exist yet — the housing domain is unimplemented end-to-end. Tasks below cover the full stack.

## Sub-Domains

### 1. Housing & Base Building

Full system design in `epic-housing-base-building.md` — housing types, construction, rooms, furniture, storage, crafting stations, social spaces. See `TASK-housing-base-building.md`.

### 2. Neighborhood & Customization

Neighborhood clusters, shared spaces, decoration contests, visitor walkthrough. See `TASK-housing-neighborhood.md`.

### 3. Companion Housing

Pet rooms, mount stables, animal pens, companion comfort bonuses. See `TASK-housing-companion.md`.

### 4. NSFW Private Spaces (integration only)

Housing provides private spaces with comfort bonuses for NSFW encounters. This is a **cross-domain integration**, NOT an NSFW sub-feature. See `TASK-nsfw-housing.md`.

### 5. Frontend UI

Dedicated housing UI independent of the NSFW UI. See `TASK-housing-frontend.md`.

## Backend API Design (proposed)

| Route                                     | Method | Purpose                        |
| ----------------------------------------- | ------ | ------------------------------ |
| `/api/housing`                            | GET    | List player housing            |
| `/api/housing`                            | POST   | Create/acquire housing         |
| `/api/housing/:id`                        | GET    | Get housing detail             |
| `/api/housing/:id`                        | PUT    | Update housing                 |
| `/api/housing/:id/rooms`                  | GET    | List rooms                     |
| `/api/housing/:id/rooms`                  | POST   | Add room                       |
| `/api/housing/:id/rooms/:roomId`          | PUT    | Update room                    |
| `/api/housing/:id/furniture`              | GET    | List furniture                 |
| `/api/housing/:id/furniture`              | POST   | Place furniture                |
| `/api/housing/:id/furniture/:furnitureId` | DELETE | Remove furniture               |
| `/api/housing/:id/storage`                | GET    | List storage containers        |
| `/api/housing/:id/storage`                | POST   | Add storage container          |
| `/api/housing/:id/crafting`               | GET    | List crafting stations         |
| `/api/housing/neighborhoods`              | GET    | List neighborhoods             |
| `/api/housing/neighborhoods`              | POST   | Create neighborhood            |
| `/api/housing/:id/visitors`               | GET    | Visitor log                    |
| `/api/housing/contests`                   | POST   | Create/join decoration contest |

> Routes are proposed; backend is not yet implemented.

## Frontend UI Scope

See `TASK-housing-frontend.md`. Dedicated housing interface:

- Housing overview + room layout visualization
- Furniture placement grid
- Storage management
- Crafting station view
- Neighborhood map with house icons
- Decoration contest panel
- Visitor walkthrough mode

## Implementation Order

1. `TASK-housing-base-building.md` — core mechanics + backend
2. `TASK-housing-neighborhood.md` — social layers
3. `TASK-housing-companion.md` — companion integration
4. `TASK-nsfw-housing.md` — private-space integration (cross-domain)
5. `TASK-housing-frontend.md` — dedicated UI

## Acceptance Criteria

- [ ] Housing domain is a standalone epic with its own backend + API + frontend
- [ ] Not bound to main narrative or NSFW narrative
- [ ] Base building works end-to-end
- [ ] Neighborhood and companion facets integrated
- [ ] Housing UI independent of NSFW UI
- [ ] Cross-domain integrations (NSFW private spaces) are explicit links, not ownership

## Related Epics

- `epic-housing-base-building.md` — Full base-building system design
- `epic-frontend-backend-integration.md` — General frontend wiring index
- `epic-nsfw-ui.md` — NSFW UI (housing NOT owned here)
