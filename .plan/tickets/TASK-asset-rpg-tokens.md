<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG Token and Map Assets

**Status:** Not Started
**Priority:** Medium
**Epic:** epic-items
**Tags:** asset, rpg

## Summary

Implement RPG-specific asset types: tokens for characters/NPCs, battle maps with grid overlay, item cards, spell icons, and condition markers.

## Requirements

### Token Assets

- Square/hex grid support (1x1, 2x2, 3x3 tokens)
- Transparent background preservation
- Token ring color customization
- Status overlay support (conditions, HP, etc.)

### Battle Map Assets

- Grid overlay (square/hex)
- Fog of war support
- Layer support (terrain, objects, tokens)
- Annotation/markup tools

### Item Card Assets

- Rarity-based styling (Common → Legendary)
- Stat display layouts
- Icon slots for stats/effects
- Tooltip integration

### Spell/Ability Icons

- Standardized icon sizes
- Category organization
- Custom icon upload support

## Acceptance Criteria

- [ ] Token asset system with grid support
- [ ] Battle map assets with grid overlay
- [ ] Item card templates with rarity styling
- [ ] Spell/ability icon system
- [ ] Condition marker assets
- [ ] Token status overlay system
- [ ] Asset upload and management
- [ ] Unit tests for asset calculations
- [ ] Integration tests for asset workflow

## Notes

- Reference `epic-items.md` for asset system design
- Consider asset compression for performance
- Balance detail vs. file size
