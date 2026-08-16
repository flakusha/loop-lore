<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Exploration & Discovery Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Epic:** epic-exploration-discovery

## Summary

Exploration and discovery mechanics — map exploration, fog of war, discovery rewards, navigation, cartography, and hidden content. Supports both guided and freeform exploration. From `epic-exploration-discovery.md`.

## Scope

### Map System

- World map with regions
- Fog of war mechanics
- Map revealing/exploration

### Discovery System

- Discovery types (locations, items, NPCs, secrets)
- Discovery rewards (XP, items, lore)
- Discovery tracking

### Navigation System

- Pathfinding and routing
- Travel time calculation
- Waypoint system

### Cartography System

- Map making skill
- Custom map creation
- Map sharing

### Hidden Content

- Secret locations
- Hidden items/NPCs
- Puzzle mechanics

## Linked Epics

- `epic-exploration-discovery.md`

## Acceptance Criteria

- [ ] World map with fog of war implemented
- [ ] Discovery system with multiple discovery types
- [ ] Discovery rewards (XP, items, lore)
- [ ] Navigation system with pathfinding
- [ ] Travel time calculation based on terrain/speed
- [ ] Cartography skill for map making
- [ ] Hidden content and secret locations
- [ ] Unit tests for navigation calculations
- [ ] Integration tests for exploration workflow

## Notes

- Reference `epic-exploration-discovery.md` for full system design
- Consider exploration XP scaling with difficulty
- Balance discovery rewards to encourage exploration
