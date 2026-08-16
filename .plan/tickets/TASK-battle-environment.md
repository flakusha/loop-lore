<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Battle-Environment Integration

**Epic:** Battle & Action Systems, Weather & Environment
**Priority:** Medium
**Effort:** High
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G4 (Battle ↔ Weather/Terrain)

## Summary

Weather and terrain conditions from the World system affect combat outcomes — rain penalizes ranged attacks, dense foliage grants cover, elevation provides advantage.

## Background

Weather lists "Combat System" as an integration; Battle never references weather/terrain modifiers. Exploration terrain features are ignored in combat.

## Implementation

### Weather Modifiers

| Condition    | Effect                                  |
| ------------ | --------------------------------------- |
| Rain         | -2 to ranged attacks, difficult terrain |
| Fog          | 50% concealment                         |
| Wind         | Disrupts flying, spreads fires          |
| Snow         | Slow movement, cold exposure            |
| Extreme Heat | Heat exhaustion                         |

### Terrain Cover

| Terrain         | Cover              |
| --------------- | ------------------ |
| Low wall        | +2 AC              |
| Tall wall       | +5 AC, total cover |
| Dense foliage   | +2 AC, concealment |
| Open field      | None               |
| Water (shallow) | Half cover         |
| Water (deep)    | 3/4 cover          |

## Acceptance Criteria

- [ ] Weather conditions apply combat modifiers
- [ ] Terrain types grant cover/AC bonuses
- [ ] Location types affect combat difficulty
