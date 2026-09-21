<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# NPC Specification

> **Status:** Partially implemented — NPC state, movement, battle AI, and inventory resolution exist; the actor-column data model, memory decay/sharing, dialogue flow, and shops below are design targets (the earlier "Final" status overstated reality). Authoritative source is `src/` and AGENTS.md.

## Implemented

- State: `npc_states` table (`src/db/schema-story.ts`; created in `src/db/migrations/001_init.ts` ~L2368) — health, mental_state, location_id, schedule, relationships, knowledge. Managed by `src/story/world-state/` (init/queries/context) and `src/story/events/application/` handlers.
- Movement: `src/rpg/npc-navigation/service/` (schedule parsing, pathfinding, movement tick) via `/api/rpg/npc-navigation/*` and `src/routes/npc-movement.ts`.
- Battle AI: `src/battle/npc-integration/` (decision, personality, battle memory, surrender) via `/api/battle/npc/*`.
- Inventory: NPC-carried items resolve via `world_items.owner_actor_id` (`src/story/items/npc-inventory.ts`).

## Not implemented / aspirational

- `npc_type` / `npc_behavior` / `npc_memory` / `npc_standing` / `npc_schedule` columns on `actors` — do not exist.
- NPC type taxonomy, memory decay + memory sharing between NPCs, dialogue flow/modifiers, shop inventory + trading, placement/migration patterns — design targets.

## Unique content (compressed)

- NPC types: merchant, quest_giver, guard, villager, monster, neutral, faction_leader, companion.
- Behavior axes (design): aggression, helpfulness, curiosity, suspicion, obedience (0–100).

## Epics

- `.plan/epics/epic-npcs.md` (Draft)
- `.plan/epics/epic-world-npcs.md`
- `.plan/epics/epic-npc-navigation.md`
- `.plan/epics/epic-social-interaction.md` (NPC social mechanics)
- `.plan/epics/epic-world-locations.md` (placement)
