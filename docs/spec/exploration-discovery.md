<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Exploration & Discovery Specification

> **Status:** Expanded 2026-10-02 from an auto-generated STUB. Grounded in `src/` (authoritative).
> Owner epic `.plan/epics/epic-exploration-discovery.md` is **Not Started**: the location substrate
> is shipped, map exploration / fog of war is not.

## Overview

Exploration and discovery mechanics — map exploration, fog of war, discovery rewards, navigation,
cartography, and hidden content.

## Scope

Shipped:

- **Location substrate:** `src/locations/` — fractal location tree (`tree.ts`), positions
  (`positions.ts`), routes (`routes.ts`), and travel engine (`travel-engine.ts`).

Open (owner epic, Not Started):

- Fog of war / visibility levels (`GameMap`, `VisibilityLevel`) — defined in the epic, with no
  `src/` module yet.
- Discovery rewards, cartography, and hidden content.

## Technical Design

- **Location tree + traversal:** `src/locations/tree.ts`.
- **Actor positions:** `src/locations/positions.ts`.
- **Routes and travel:** `src/locations/routes.ts`, `src/locations/travel-engine.ts`.

## Integration Points

- `src/locations/` — consumed by `src/routes/worlds/fractal-locations-routes.ts`
  (`LocationTreeService`, `ActorPositionService`) and `src/routes/worlds/fractal-travel-routes.ts`
  (`TravelRouteService`).
- Related specs: `docs/spec/locations.md`, `docs/spec/worlds.md`.

## Related Epics

- `.plan/epics/epic-exploration-discovery.md` — owner (Not Started)
- `.plan/epics/epic-fractal-locations.md`
