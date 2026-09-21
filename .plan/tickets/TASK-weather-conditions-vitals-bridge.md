<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Weather → conditions, vitals drain, equipment protection bridge

**Summary:** Weather exists as battle-scoped modifiers and free-text prompt context (location_states.weather) with no effect on characters. Bridge weather (and later layered weather from epic-weather-environment.md) to character state: harsh layers apply Condition entries (cold → frozen, acid rain → poisoned, fog → perception-reducing disoriented), drain Vitals over time (stamina in harsh biomes; regenerate during peaceful periods), and EquipmentSlot properties (insulation, armor) mitigate environmental damage.
**Context:** Write-back integration ticket for epic-character-world-integration.md; the first character write-back scheduled behind the world tick (substrate: FEAT-2d-world-npc-simulation-tiers tick or location_states updates).
**Acceptance Criteria:** Weather-layer → condition mapping table; conditions applied/removed as layers change; vitals drain/regen hooks run on the tick and are idempotent; equipment insulation reduces drain; changes visible in prompt assembly and character state API; unit tests for apply/remove/mitigate cycles.

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Large

**References:**
- Epic: .plan/epics/epic-character-world-integration.md
- Weather owner: .plan/epics/epic-weather-environment.md, .plan/tickets/TASK-weather-environment.md
- Consumes: src/rpg/service/character-stats.ts (conditions/vitals plumbing), src/rpg/combat/conditions.ts
- Depends on: TASK-shared-character-domain-models

**Branch:** open on dev.
