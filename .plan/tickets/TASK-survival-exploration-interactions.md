<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Exploration, scavenging & survival interactions (/loot /search /forage /hunt /track /shelter …)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-rpg-mechanics

**Summary:**
**Context:**
**Acceptance Criteria:**

## Summary

Survival category of the expanded interaction catalog: resource acquisition from natural and artificial environments. Depends on `TASK-interaction-service-foundation`.

## Scope

- `/loot` — containers/bodies/piles; `/look-at` — observe for hidden details; `/search` — hidden items/traps; `/listen` — behind doors/distance; `/sniff` — poison test / scent detection (Perception).
- `/forage` (Survival skill), `/hunt` — small prey; `/track` — follow signs of creature or person.
- `/climb` / `/descend` / `/scramble` — vertical and rough terrain navigation.
- `/shelter` — temporary camp, weather protection (reads active weather from `epic-weather-environment`).
- Resource costs: time/location-gated probability of finding; yields feed inventory and crafting inputs (`TASK-economy-crafting-slash-interactions`).

## Acceptance Criteria

- [ ] All verbs registered; perception/survival skill matrix entries
- [ ] Weather interaction: `/shelter` mitigates active environmental effects
- [ ] Location-based find tables; loot/forage yields persist as inventory items
- [ ] Tests: find-probability branches, weather hook, inventory write

## Linked Epics

- `epic-rpg-mechanics.md`
- `epic-weather-environment.md`
- `epic-quests-encounters.md` (discovery triggers)
