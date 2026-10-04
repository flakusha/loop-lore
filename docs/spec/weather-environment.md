<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Weather & Environment Systems Specification

> **Status:** Expanded 2026-10-02 from an auto-generated STUB. Grounded in `src/` (authoritative).
> Owner epic `.plan/epics/epic-weather-environment.md` is **Not Started**: battle-side integration is
> shipped, the world-level weather engine is not.

## Overview

Weather and environmental mechanics — dynamic weather, terrain effects, environmental hazards,
climate zones, and their gameplay impact. Integrates with world conditions and the battle system.

## Scope

Shipped:

- **Battle weather/terrain integration:** `src/battle/weather-integration/` — terrain, hazards,
  positional modifiers, visibility, and environmental modifiers (barrel `index.ts`).
- **Shared weather schemas:** `src/battle/integration-schemas/weather.ts` — `CombatWeather`,
  `EnvironmentalModifier`, `getCombatWeatherModifiers()`.
- **HTTP surface:** `src/routes/battle/weather.ts`.

Open (owner epic, Not Started):

- World-level dynamic weather engine, climate zones, weather scheduling/ticks.
- Disease linkage (`rain spreads waterborne disease; cold weakens immunity`) is declared as an
  integration edge but has no engine.

## Technical Design

- **Terrain model:** `src/battle/weather-integration/types.ts` — `BattleTerrain`,
  `EnvironmentalHazard`, `CoverType`, `Elevation`.
- **Hazards:** `generateEnvironmentalHazard()` in `src/battle/weather-integration/hazards.ts`.
- **Modifiers:** `getEnvironmentalModifiers()` / `applyEnvironmentalModifiers()` in
  `src/battle/weather-integration/modifiers.ts`.
- **Position:** `calculateCoverBonus()` / `calculateElevationBonus()` in
  `src/battle/weather-integration/position.ts`.
- **Terrain effects:** `createBattleTerrain()` / `isTerrainAffectedByWeather()` in
  `src/battle/weather-integration/terrain.ts`.
- **Visibility:** `calculateVisibility()` in `src/battle/weather-integration/visibility.ts`.

## Integration Points

- `src/battle/integration-schemas/weather.ts` — shared combat weather type and modifiers.
- `src/rpg/integration-registry/edges/disease.ts` — weather↔disease edges (waterborne spread,
  plague-affected weather).
- `src/battle/weather-integration/` — consumed by battle resolution.

## Related Epics

- `.plan/epics/epic-weather-environment.md` — owner (Not Started)
- `.plan/epics/epic-battle-integration-gaps.md`
- `.plan/epics/epic-nsfw-integration-gaps.md`
