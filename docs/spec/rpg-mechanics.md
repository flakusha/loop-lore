<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# RPG Mechanics Specification

> **Status:** Partially implemented. Phase 1 core (dice/stats/combat/xp/loot) implemented and route-wired 2026-08-14; crafting, achievements, skills, replayability, questions, npc-navigation, and world-location-traits added since, all under `/api/rpg`. An earlier banner claiming "NOT IMPLEMENTED — no `src/rpg/`" was false. Authoritative source is `src/` and AGENTS.md.

## Implemented

- Modules: `src/rpg/{dice,stats,combat,xp,loot,crafting,achievements,skills,replayability,npc-navigation,world-location-traits,integration-registry,questions}` plus `status-effects.ts`, `trauma.ts`, `reputation.ts`.
- Services: `src/rpg/service/` — `dice-roll.ts`, `character-stats.ts`, `loot-tables.ts`, `world-gate.ts` (per-world `rpg_enabled` opt-in), `battles/` (orchestration + `battles` table persistence).
- Routes: `src/routes/rpg/` → `/api/rpg/{dice,stats,achievements,combat,crafting,skills,replayability,npc-navigation,questions,world-location-traits,xp-loot}`; battle surface under `src/routes/battle/`.

## Not implemented / aspirational

- Per-world control levels, per-subsystem toggles, plugin API, admin/GM UI → `.plan/epics/epic-mechanics-governance.md`.
- Traits/skill-progression depth and buff ownership → `.plan/epics/epic-rpg-progression.md`; full item/economy scope → `.plan/epics/epic-items-economy-crafting.md`; unified PlayerState → `.plan/epics/epic-player-state-machine.md` (Draft).
- In this spec, design-only: dual-state character model, d20 DC/difficulty tables, trading/economy prompt templates.

## Unique content (compressed)

- Philosophy: **the LLM proposes, code disposes** — the LLM generates narrative/intent; the engine validates, resolves, and applies; the LLM never mutates state.
- Core mechanic: d20 + modifier; notation `NdX±M` (`src/rpg/dice/notation.ts`); effective stats computed at use time (base + equipment folds).
- Equipment slots: head, chest, legs, feet, hands, mainHand, offHand, ring1, ring2, amulet, cloak.
- External references: D&D 5e SRD (stats/combat/skill checks), Multihog DnD Framework (dual-state tracking, hybrid RNG), Horae (modular RPG, equipment slots, status bars), Waypoint ("LLM proposes, code disposes"), OpenDungeon (TypeScript mechanics + LLM narrative).

## Epics

- `.plan/epics/epic-rpg-mechanics.md` (hub — Phase 1 ✅ 2026-07-31) and its 6 sub-epics, indexed in `docs/spec/rpg-mechanics-extensions.md`.
