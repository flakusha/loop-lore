<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Crafting-Enchanting Integration

**Epic:** Crafting & Professions, Magic & Spell Systems
**Priority:** Medium
**Effort:** Medium
**Status:** Not Started
**Created:** 2026-07-28
**Cross-Mechanics Gap:** G11 (Crafting ↔ Magic)

## Summary

Enchanting as a cross-system feature between Crafting and Magic — magical items are crafted through crafting mechanics enhanced by spell knowledge.

## Background

Magic says "Enchanting uses crafting mechanics"; Crafting never mentions Magic for enchanted items. This is a one-way reference that needs bidirectional integration.

## Implementation

### Enchanting as Crafting Process

1. Crafter selects base item (crafted via crafting system)
2. Crafter applies enchantment using spell knowledge
3. Magic system validates spell compatibility with item type
4. Enchantment cost (mana, materials, time) calculated
5. Item gains magical properties

### Cross-System Dependencies

- Crafting provides: base item, manufacturing skill, tools
- Magic provides: spell knowledge, enchantment slots, mana
- Item System provides: item types, rarity, stat scaling

## Acceptance Criteria

- [ ] Enchanting uses crafting as base process
- [ ] Magic validates spell-item compatibility
- [ ] Enchantment costs are reasonable
- [ ] Enchanted items scale with crafter skill
- [ ] Enchanting failure can damage item
