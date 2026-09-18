<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# NPC Navigation & Pathfinding Specification

> Promoted 2026-09-18 from STUB. Authoritative source is `src/` and AGENTS.md.

## Overview

NPC navigation moves NPCs through `src/world/` locations over time. Implementation in `src/rpg/npc-navigation/service/` provides pathfinding between connected `location_states`.

## Scope

- Pure in-process pathfinding — no network sync.
- Tick-based: NPC moves one step per processMovementTick.
- Decisions route through NPC state machine (`src/story/npc-states.ts`).

<!-- GAP: full graph pathfinding (A* over location graph) is partial; current implementation uses simple connection traversal. -->

## Technical Design

- **Service:** `src/rpg/npc-navigation/service/` exposes `processMovementTick` (covered by `service.test.ts`, 1.1KB).
- **Data model:** `location_states` graph edges + `npc_states.current_location_id`.
- **Tick cadence:** invoked from `src/cron/jobs.ts` (NPC movement tick).
- **Encounter integration:** arrival at a new location triggers encounter check via `src/rpg/encounters/service/`.

## Integration Points

- `src/rpg/npc-navigation/service/` — pathfinding
- `src/world/` — location graph
- `src/cron/jobs.ts` — tick scheduler
- `src/rpg/encounters/service/` — encounter-on-arrival

## Related Epics

- `.plan/epics/epic-npc-navigation.md`
- `.plan/epics/epic-world-travel-time.md`
