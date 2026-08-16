<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-2026-049: Item System Extensions - Usable/Collectable/Consumable

**Status**: open
**Priority**: medium
**Labels**: feature, items, rpg
**Assignee**:
**Epic**: EPIC-039 (Item System Extensions)

## Description

Extend item system with state machines for item types: usable, collectable, consumable. Items linked to characters via inventory slots.

### Item System Reference

**State Machines (No boolean flags)**

```typescript
enum ItemUseState {
  Available = "available", // Ready to use
  Equipped = "equipped", // Currently equipped
  Consumed = "consumed", // Used up
  Depleted = "depleted", // Out of charges
}

enum ItemCollectState {
  Unowned = "unowned", // Not in anyone's inventory
  Owned = "owned", // In inventory
  Traded = "traded", // Exchanged between characters
  Lost = "lost", // Dropped, stolen, destroyed
}

enum ItemConsumeState {
  Ready = "ready", // Can be consumed
  Pending = "pending", // Consumption in progress
  Consumed = "consumed", // Fully consumed
}
```

**Instance-Based Inventory**

```toml
[temporary.inventory]
capacity_weight = 50.0
current_weight = 12.5

[[temporary.inventory.slots]]
slot_id = "main_hand"
item_instance_id = "uuid-sword-001"
definition_ref = "longsword_std"
durability_current = 45
durability_max = 100
enchantments = [{ id = "flame_tongue", level = 1 }]
history = ["Forged in Dragonfire", "Broke during siege of X"]
```

### Acceptance Criteria

- [ ] Add `ItemUseState` state machine (available, equipped, consumed, depleted)
- [ ] Add `ItemCollectState` state machine (unowned, owned, traded, lost)
- [ ] Add `ItemConsumeState` state machine (ready, pending, consumed)
- [ ] Instance-based inventory with `item_instance_id` / `definition_ref`
- [ ] Item history tracking (forged, broken, enchanted)

### Related

- **Feature spec:** `FEAT-item-system-extensions.md`

## Notes

Link to character template seeding — items can be seeded with characters as starting equipment.
