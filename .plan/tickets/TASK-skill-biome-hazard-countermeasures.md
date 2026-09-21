<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Biome hazards with skill-based countermeasures

**Summary:** Biomes have no hazard model — only a deferred evaluation spike (IDEA-2026-001-evaluate-biome) and battle-scoped environmental hazards in src/battle/weather-integration/. Define BiomeHazard (toxic air, extreme temperature, water crossing, terrain traps) whose countermeasures reference character Skill IDs; a matching skill reduces hazard severity or enables traversal.
**Context:** Part of epic-character-world-integration.md. Builds on existing environmental hazard generation (generateEnvironmentalHazard) and the species/terrain layer; character survival/swimming skills from src/rpg/skills/service gate outcomes.
**Acceptance Criteria:** BiomeHazard interface with countermeasures: Skill-name[]; hazard resolution reads character skills and reduces severity when a countermeasure skill meets threshold; resolution outcome surfaced in the prompt section for the location; unit tests for mitigate/no-mitigate/no-skill paths.

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**References:**
- Epic: .plan/epics/epic-character-world-integration.md
- Adjacent: .plan/tickets/IDEA-2026-001-evaluate-biome.md, src/battle/weather-integration/, docs/spec/rpg-mechanics.md (TerrainType/NavigationHazard via epic-exploration-discovery.md)

**Branch:** open on dev.
