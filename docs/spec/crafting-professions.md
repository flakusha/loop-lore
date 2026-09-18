<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Crafting & Professions Specification

> Promoted 2026-09-18 from STUB. Authoritative source is `src/` and AGENTS.md.

## Overview

Crafting / professions system lives in `src/rpg/crafting/`. Recipes are deterministic transformations driven by `process.ts` (orchestrator) with `orders.ts` (input/output validation) and `stations.ts` (station type / location gating).

## Scope

- **Recipes** in `src/rpg/crafting/recipes/` define input → output transforms with material weights.
- **Stations** gate recipes by location (forge, alchemy lab, kitchen, etc.) via `station-types.ts`.
- **Orders** track in-flight crafting jobs (`orders.ts`).
- **Processes** are the orchestrator entrypoint (`process.ts`) — handles material consumption, output production, skill XP.

## Technical Design

- **Data model:** world-scoped recipes on `world_states.crafting`; orders persisted via DB.
- **Service:** `src/rpg/crafting/` is a fully-tested module (16KB `process.test.ts`, 11KB `stations.test.ts`).
- **Skill XP:** successful craft awards XP via `src/rpg/xp/sources.ts`.
- **Material validation:** `orders.ts` rejects invalid input combinations pre-process.

## Integration Points

- `src/rpg/crafting/process.ts` — orchestrator
- `src/rpg/crafting/orders.ts` — material validation
- `src/rpg/crafting/stations.ts` — location-gating
- `src/rpg/xp/sources.ts` — XP award on success
- `src/services/actor-items.ts` — inventory mutations

## Related Epics

- `.plan/epics/epic-crafting-professions.md`
- `.plan/epics/epic-skills.md` (XP routing)
