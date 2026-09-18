<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Companion, Pet & Mount Systems Specification

> Promoted 2026-09-18 from STUB. Authoritative source is `src/` and AGENTS.md.

## Overview

Companion / pet / mount systems are model-level RPG affordances surfaced through actor `properties` and the `rpg/` service layer. They are **not** first-class DB tables; companion state lives on the owning actor record and the `world_states` companion slot.

## Scope

- Companions travel with an actor (chat participant) and influence world generation, narrative beats, and stat modifiers.
- Pets are passive cosmetic companions with no combat behavior.
- Mounts provide travel speed bonuses and inventory carrying capacity.

<!-- GAP: dedicated companion tables (companions, companion_state) are aspirational; current implementation rides on `world_states` + actor `properties`. -->

## Technical Design

- **Data model:** companion slot on `world_states` (per-actor-per-world). Mount state on actor `properties.mount`.
- **Service:** `src/rpg/service/` exposes `character-stats.ts` (modifier pipeline) and `dice-roll.ts` (mount speed check).
- **Stat integration:** companion bonuses flow through `src/rpg/stats/modifiers.ts` proficiency + equipment modifiers.
- **Persistence:** companion state persists across sessions via the actor DB row; no separate migration required.

## Integration Points

- `src/rpg/service/character-stats.ts` — stat modifier application
- `src/rpg/stats/modifiers.ts` — modifier pipeline (companion proficiency)
- `src/story/` quest engine — companion-aware encounter gating
- `src/world/` location system — companion presence gates location access

## Related Epics

- `.plan/epics/epic-companion-pet-mount.md`
