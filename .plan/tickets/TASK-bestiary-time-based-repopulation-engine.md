<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Bestiary Bestiary Time Based Repopulation Engine

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-enemies-monsters
**Tags:** bestiary, repopulation, tick


Bestiary: Bestiary Time Based Repopulation Engine


- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Summary:**
Tick-driven engine that adds new entities to a location based on the species repopulation rule.

**Context:**
Bestiary entries declare a repopulation rule (mode, interval, cap, probability per tick). The world tick scheduler (see `epic-actor-autonomy-story-drive` and `epic-time-scale`) needs a hook to call this engine on each tick. Replenishment must not exceed `cap`, must respect game-time, and must consume ecology pressure input.

**Acceptance Criteria:**
- `src/bestiary/repopulation.ts` exports `applyRepopulationTick(worldId, currentTick, db)`: iterates species where `interval` elapsed since `lastSpawnTick`, rolls `probabilityPerTick`, increments population row count up to `cap`.
- Modes: `circadian` (game-hour-of-day), `seasonal` (game-day-of-year), `harvest-regrowth`, `manual`, `ecology` (driven by ecology engine).
- Called from world-tick service with optional bypass flag (admin force-spawn does NOT use this path).
- Tested with frozen time: 100 ticks advance, cap respected, no race vs simultaneous force-cull (transactional update).


git issue: 8ff87a5
