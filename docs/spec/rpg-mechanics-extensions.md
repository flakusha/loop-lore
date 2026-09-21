<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# RPG Mechanics Extensions Specification

> **Status:** Index — a pointer page over the `epic-rpg-mechanics.md` sub-epics and extension systems; defines no new design. Authoritative source is `src/` and AGENTS.md.

## Sub-epics of the epic-rpg-mechanics.md hub

1. `.plan/epics/epic-rpg-core-wiring.md` — route mounting / registry (🟡 XP/loot + combat routes mounted 2026-08-14; registry + combat persistence outstanding)
2. `.plan/epics/epic-mechanics-governance.md` — per-world config, control levels, plugin API, admin UI (Not Started)
3. `.plan/epics/epic-rpg-progression.md` — traits, skills, buffs/debuffs (Not Started)
4. `.plan/epics/epic-items-economy-crafting.md` — item stats, economy, unique items, crafting (Not Started)
5. `.plan/epics/epic-rpg-content-systems.md` — quests, achievements, RPG chat (Not Started)
6. `.plan/epics/epic-player-state-machine.md` — unified cross-system PlayerState (Draft; scaffold at `src/rpg/integration-registry/player-state-layers.ts`)

## Extension code already wired

Under `/api/rpg` (assembled in `src/routes/rpg/index.ts`): crafting (stations + execution), skills (+ actor progression), replayability (playthroughs, new-game-plus, meta-progression), achievements (+ player progress), questions, world-location-traits, npc-navigation, combat (+ status effects), stats (+ actor stats), xp-loot (+ tables).

## Domain epics for not-yet-built extensions

- `.plan/epics/epic-crafting-professions.md`
- `.plan/epics/epic-faction-reputation.md`
- `.plan/epics/epic-disease-poison.md`
- `.plan/epics/epic-weather-environment.md` (weather already affects battle: `src/battle/weather-integration/`)
- `.plan/epics/epic-stealth-crime.md`
- `.plan/epics/epic-economy-trading.md`
- `.plan/epics/epic-companion-pet-mount.md`
- `.plan/epics/epic-exploration-discovery.md`
- `.plan/epics/epic-replayability.md`
- `.plan/epics/epic-skills.md`
- `.plan/epics/epic-time-scale.md`
- `.plan/epics/epic-achievements.md`

Core hub: `.plan/epics/epic-rpg-mechanics.md`
