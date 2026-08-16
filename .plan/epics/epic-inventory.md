<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Inventory

**Status:** 📝 Draft
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** inventory, items, storage, management, equipment

## Overview

Inventory system specification — covers item storage, equipment slots, inventory management, and item interactions. Supersedes inventory sections in `docs/spec/actors.md`.

## Reference

- Spec: `docs/spec/inventory.md`
- Related: `docs/spec/actors.md`, `docs/spec/items.md`

## Implementation

> **Active development tracked in:** [`epic-item-systems-unification.md`](/epic-item-systems-unification) — unifies inventory systems, adds equip/trade/weight mechanics, and links NPC inventory to world items.

## Inventory Systems

### Core Inventory Model

interface Inventory {
}
interface InventorySlot {
}
interface InventoryItem {
}
interface EquipmentSlot {
}

## Acceptance Criteria

- [ ] Inventory storage model implemented
- [ ] Equipment slot system functional
- [ ] Item interactions working
- [ ] Inventory management UI operational
