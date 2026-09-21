<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Battle Specification

> **Status:** Core battle layer implemented and route-wired (`battleRoutes` mounted; wiring verified 2026-08-04). PvP/mode-switching gameplay and battle UI remain open in the battle sub-epics. Authoritative source is `src/` and AGENTS.md.

## Implemented

- HTTP surface: `src/routes/battle/` (all POST, prefix `/api/battle/`): equipment {calculate, calculate-from-items, can-equip, durability, repair, loot, combat-use}, social {intimidate, taunt, surrender, rally, inspire, demoralize}, npc {decision, memory, surrender}, weather {modifiers, visibility, hazard}, resolution {damage, attack, defense, round}, morale {compute, apply, break}.
- Pure engines: `src/battle/` — resolution-integration (checks, dc, initiative, attacks), social-integration (morale, surrender, support, offensive), npc-integration (decision, personality, memory), weather-integration, item-mapping + items-integration, integration-schemas.
- Orchestration + persistence: `src/rpg/service/battles/`; `battles` table (`src/db/migrations/001_init.ts` ~L2782, chat-scoped).
- Combat primitives: `src/rpg/combat/`; dice: `src/rpg/dice/` + `src/rpg/service/dice-roll.ts`.

## Not implemented / aspirational

- PvP / hybrid battle types; Scripted vs HalfLLM vs FullLLM mode switching; turn order + turn time limits; battle pause/resume; dedicated battle UI — see epics.

## Unique content (compressed)

- Battle modes: Scripted (no LLM), HalfLLM (LLM narrates, mechanics scripted), FullLLM.
- Battle states: setup, active, paused, completed, fled.

## Epics

- `.plan/epics/epic-battle-action-systems.md` (hub split into 5 sub-epics; backend wiring done, gameplay scope open)
- `.plan/epics/epic-battle-integration-gaps.md`
- `.plan/epics/epic-battle-ui.md`
- `.plan/epics/epic-enemies-monsters.md`
