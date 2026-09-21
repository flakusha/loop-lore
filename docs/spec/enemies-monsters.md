<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Enemies & Monsters Systems Specification

> **Status:** Partially implemented — combat primitives, battle NPC AI, NPC state, and loot exist in `src/`; the monster catalog / ecology epic is Not Started. Authoritative source is `src/` and AGENTS.md.

## Implemented

- Combat mechanics: `src/rpg/combat/` (actions, attacks, conditions, damage, initiative, saves).
- Battle/encounter orchestration: `src/rpg/service/battles/` (actions, persistence, types) + `battles` table (`src/db/migrations/001_init.ts` ~L2782).
- NPC state: `npc_states` table (`src/db/schema-story.ts`; created in `src/db/migrations/001_init.ts` ~L2368) — health, mental_state, location_id, schedule. Managed via `src/story/world-state/` and `src/story/events/application/` handlers. (An earlier revision cited a nonexistent `src/story/npc-states.ts`.)
- NPC AI: movement/pathfinding in `src/rpg/npc-navigation/service/` (`/api/rpg/npc-navigation/*`); battle decisions in `src/battle/npc-integration/` (`/api/battle/npc/{decision,memory,surrender}`).
- Loot: `src/rpg/loot/` (generation → `world_items`, tables, templates, weights).
- Dice: `src/rpg/service/dice-roll.ts` canonical roller; `src/rpg/dice/` notation parsing.
- World opt-in: `src/rpg/service/world-gate.ts` (`worlds.rpg_enabled`).
- Quest-driven encounters: `src/story/quest-engine/` (see `docs/spec/quests-encounters.md`).

## Not implemented / aspirational

- Monster catalog (behaviour profiles, base stats, per-location bindings), time-based repopulation, and ecology balance (predator/prey, territorial repulsion).

## Epics

- `.plan/epics/epic-enemies-monsters.md` (Not Started)
- `.plan/epics/epic-battle-action-systems.md`
- `.plan/epics/epic-rpg-core-wiring.md`
