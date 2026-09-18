<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Enemies & Monsters Systems Specification

> Promoted 2026-09-18 from STUB. Authoritative source is `src/` and AGENTS.md.

## Overview

Enemies and monsters are RPG combatants configured per-encounter. Implementation lives in `src/battle/` for combat mechanics and `src/rpg/service/battles/` for encounter orchestration. NPC state is in `src/story/npc-states.ts` (mapped via `world_states.npc_states`).

## Scope

- **Combat:** `src/rpg/combat/` provides actions / attacks / conditions / damage / initiative / saves.
- **Encounters:** `src/rpg/encounters/service/` orchestrates per-encounter enemy spawn, AI behavior, loot.
- **NPC AI:** `src/rpg/npc-navigation/service/` handles pathing + decision logic.
- **Loot:** `src/rpg/loot/` (generation, persist, templates, table, weights) drops items on enemy defeat.

## Technical Design

- **Data model:** NPCs persisted via `npc_states` table; per-encounter state is ephemeral.
- **Combat resolution:** `src/rpg/service/dice-roll.ts` is the canonical dice engine; `src/rpg/dice/` provides notation parsing + roll execution.
- **Difficulty:** `src/rpg/service/world-gate.ts` gates encounters by world-level opt-in.
- **AI:** enemy AI uses `src/rpg/npc-navigation/service/` pathing with simple state machine.

## Integration Points

- `src/rpg/combat/` — combat mechanics
- `src/rpg/service/battles/` — encounter orchestration
- `src/rpg/loot/` — loot generation / persistence
- `src/rpg/npc-navigation/service/` — NPC AI pathing
- `src/story/quest-engine/` — quest-driven encounters

## Related Epics

- `.plan/epics/epic-enemies-monsters.md`
- `.plan/epics/epic-battle-action-systems.md`
- `.plan/epics/epic-rpg-core-wiring.md`
