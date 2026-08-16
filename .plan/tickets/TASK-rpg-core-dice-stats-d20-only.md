<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG Core: Dice & Stats (d20 only)

**Status:** ✅ Complete
**Priority:** high
**Effort:** Medium
**Epic:** epic-rpg-mechanics

## Summary

Minimal RPG foundation: dice engine (d20 notation) + 6 core stats (STR/DEX/CON/INT/WIS/CHA). Selectable per world/location/chat. No combat, skills, items, magic yet. Just dice rolling and stat blocks on actors.

## Acceptance Criteria

- [x] Dice engine with d4, d6, d8, d10, d12, d20 support
- [x] NdS±M notation parser (e.g. `2d6+3`)
- [x] Advantage/disadvantage for d20 rolls
- [x] Exploding dice support
- [x] Crypto-grade entropy via `crypto.getRandomValues`
- [x] Six core stats (STR/DEX/CON/INT/WIS/CHA) with D&D 5e modifiers
- [x] Point-buy stat generation (27 points)
- [x] 4d6-drop-lowest stat generation
- [x] Standard array (15, 14, 13, 12, 10, 8)
- [x] Stat block validation
- [x] Tests passing (56 tests: 24 dice + 32 stats)
