# Inventory Specification

**Status:** Draft
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

This document defines the inventory system for loop-lore: how items are stored, organized, managed, and interacted with by characters and NPCs.

The inventory system is separate from the item definition system (`docs/spec/items.md`). It handles inventory management (capacity, weight, organization) while items.md handles what items exist and how they work.

---

## 1. Inventory Data Model

### 1.1 Inventory Container

An inventory is a container that holds items. Every actor (player character, NPC) has an inventory. Locations and storage containers can also have inventories.

```typescript
interface Inventory {
  id: string;
  owner_id: string; // actor_id, location_id, or storage_id
  owner_type: "actor" | "location" | "storage" | "vehicle";
  name: string;
  capacity_weight: number; // max weight
  capacity_slots: number; // max number of item stacks
  current_weight: number;
  current_slots: number;
  items: InventorySlot[];
  permissions: InventoryPermissions;
}

interface InventorySlot {
  slot_id: string;
  item_instance_id: string; // references actor_items.id or world_items.id
  quantity: number;
  equipped: boolean; // for equipment slots
  sort_order: number; // for UI organization
}
```

### 1.2 Capacity Systems

#### Weight-Based Capacity

```typescript
interface WeightCapacity {
  max_weight: number; // e.g., 50.0 kg
  current_weight: number;
  encumbrance: number; // 0-100, calculated from weight
  encumbrance_thresholds: {
    light: number; // 0-30% — no penalty
    moderate: number; // 31-60% — -10% speed
    heavy: number; // 61-80% — -25% speed, reduced actions
    overloaded: number; // 81-100% — -50% speed, can't act
  };
}
```

#### Slot-Based Capacity

```typescript
interface SlotCapacity {
  max_slots: number; // e.g., 20
  current_slots: number;
  stackable_items: string[]; // item definition IDs that can stack
  max_stack_size: number; // max items per stack (default 99)
}
```

### 1.3 Inventory Organization

```typescript
interface InventoryOrganization {
  // Categories for sorting/filtering
  categories: InventoryCategory[];

  // Sort options
  sortBy: "name" | "type" | "rarity" | "value" | "weight" | "equipped";
  sortOrder: "asc" | "desc";

  // Filter options
  filters: InventoryFilter[];

  // Grouping
  groupBy: "category" | "type" | "rarity" | "location" | "none";
}

interface InventoryCategory {
  id: string;
  name: string;
  item_type_ids: string[];
  icon: string;
  color: string;
}

interface InventoryFilter {
  type: "type" | "rarity" | "equipped" | "stackable" | "durability" | "value";
  operator: "eq" | "gt" | "lt" | "gte" | "lte" | "contains";
  value: string | number;
}
```

### 1.4 Equipment Slots

Equipment slots define where items can be worn/held:

```typescript
interface EquipmentSlot {
  id: string;
  name: string;
  type:
    | "weapon"
    | "armor"
    | "offhand"
    | "head"
    | "body"
    | "legs"
    | "feet"
    | "hands"
    | "neck"
    | "finger"
    | "back"
    | "waist"
    | "shoulder"
    | "chest"
    | "accessory";
  allowed_item_types: string[]; // item definition IDs or type tags
  max_one: boolean; // can only equip one item in this slot
  requires_equip_check: boolean; // requires a skill check to equip
}

const DEFAULT_EQUIPMENT_SLOTS: EquipmentSlot[] = [
  {
    id: "main_hand",
    name: "Main Hand",
    type: "weapon",
    allowed_item_types: ["weapon",],
    max_one: true,
    requires_equip_check: false,
  },
  {
    id: "off_hand",
    name: "Off Hand",
    type: "offhand",
    allowed_item_types: ["weapon", "shield",],
    max_one: true,
    requires_equip_check: false,
  },
  {
    id: "head",
    name: "Head",
    type: "head",
    allowed_item_types: ["armor",],
    max_one: true,
    requires_equip_check: false,
  },
  {
    id: "body",
    name: "Body",
    type: "body",
    allowed_item_types: ["armor",],
    max_one: true,
    requires_equip_check: false,
  },
  {
    id: "legs",
    name: "Legs",
    type: "legs",
    allowed_item_types: ["armor",],
    max_one: true,
    requires_equip_check: false,
  },
  {
    id: "feet",
    name: "Feet",
    type: "feet",
    allowed_item_types: ["armor",],
    max_one: true,
    requires_equip_check: false,
  },
  {
    id: "hands",
    name: "Hands",
    type: "hands",
    allowed_item_types: ["armor", "gloves",],
    max_one: true,
    requires_equip_check: false,
  },
  {
    id: "neck",
    name: "Neck",
    type: "neck",
    allowed_item_types: ["accessory",],
    max_one: true,
    requires_equip_check: false,
  },
  {
    id: "finger",
    name: "Finger",
    type: "finger",
    allowed_item_types: ["accessory",],
    max_one: false,
    requires_equip_check: false,
  },
  {
    id: "back",
    name: "Back",
    type: "back",
    allowed_item_types: ["armor", "weapon", "pack",],
    max_one: true,
    requires_equip_check: false,
  },
  {
    id: "waist",
    name: "Waist",
    type: "waist",
    allowed_item_types: ["accessory", "tool",],
    max_one: true,
    requires_equip_check: false,
  },
  {
    id: "shoulder",
    name: "Shoulder",
    type: "shoulder",
    allowed_item_types: ["armor", "accessory",],
    max_one: true,
    requires_equip_check: false,
  },
];
```

---

## 2. Inventory Operations

### 2.1 Core Operations

| Operation          | Description                    | Validation                                |
| ------------------ | ------------------------------ | ----------------------------------------- |
| `add_item`         | Add item to inventory          | Capacity check, stackability, item limits |
| `remove_item`      | Remove item from inventory     | Item must exist in inventory              |
| `equip_item`       | Equip item to a slot           | Slot compatibility, stat requirements     |
| `unequip_item`     | Remove item from slot          | Item must be equipped                     |
| `swap_items`       | Swap two items in inventory    | Both items must be in same inventory      |
| `transfer_item`    | Move item between inventories  | Source ownership, destination capacity    |
| `drop_item`        | Drop item at current location  | Item must be droppable                    |
| `pickup_item`      | Pick up item from location     | Item must be at current location          |
| `sort_inventory`   | Reorganize inventory           | No validation needed                      |
| `filter_inventory` | Filter by type/rarity/equipped | No validation needed                      |

### 2.2 Transfer Rules

```typescript
interface InventoryTransfer {
  source_inventory_id: string;
  target_inventory_id: string;
  item_instance_id: string;
  quantity: number;

  // Validation
  source_owns: boolean;
  target_has_capacity: boolean;
  item_transferable: boolean; // not soulbound, not quest-locked
  weight_check: boolean; // target can hold the weight
  slot_check: boolean; // target has an available slot

  // Context
  transfer_type: "drop" | "pickup" | "trade" | "gift" | "loot" | "quest" | "stolen";
  requires_permission: boolean; // does the transfer need approval?
}
```

---

## 3. Inventory Persistence

### 3.1 Persistence Rules

| Inventory Type      | Persistence                 | Notes                     |
| ------------------- | --------------------------- | ------------------------- |
| Character inventory | Persistent                  | Saved with character data |
| NPC inventory       | Persistent                  | Saved with NPC data       |
| Location storage    | Persistent                  | Saved with location data  |
| Vehicle inventory   | Persistent                  | Saved with vehicle data   |
| Temporary inventory | Ephemeral                   | Lost on session end       |
| Trade escrow        | Persistent until completion | Saved with trade state    |

### 3.2 Cross-World Inventory Rules

When a character moves between worlds:

| Item Type            | Travel With Character | Notes                            |
| -------------------- | --------------------- | -------------------------------- |
| Equipment            | Yes                   | Always travels with character    |
| Consumables          | Yes                   | Usable in any world              |
| Key items            | Yes                   | Quest items always travel        |
| Currency             | Yes                   | Gold/silver/copper travel        |
| Location-bound items | No                    | Left behind at original location |
| World-specific items | No                    | Only available in their world    |
| Soulbound items      | Yes                   | Cannot be transferred            |
| Quest-locked items   | Conditional           | Depends on quest state           |

---

## 4. Database Schema

### actor_items (existing, extended)

```sql
-- Already defined in schema-story.ts
-- actor_items table:
-- id, actor_id, name, description, item_type, quantity, value, weight, tags, metadata, equipped, sort_order

-- Add these columns for inventory management:
ALTER TABLE actor_items ADD COLUMN inventory_id TEXT REFERENCES inventories(id);
ALTER TABLE actor_items ADD COLUMN slot_id TEXT; -- equipment slot
ALTER TABLE actor_items ADD COLUMN durability_current INTEGER;
ALTER TABLE actor_items ADD COLUMN durability_max INTEGER;
ALTER TABLE actor_items ADD COLUMN charges INTEGER; -- for consumables/usable items
ALTER TABLE actor_items ADD COLUMN stackable INTEGER NOT NULL DEFAULT 1;
ALTER TABLE actor_items ADD COLUMN max_stack INTEGER NOT NULL DEFAULT 1;
ALTER TABLE actor_items ADD COLUMN soulbound INTEGER NOT NULL DEFAULT 0;
ALTER TABLE actor_items ADD COLUMN quest_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE actor_items ADD COLUMN world_id TEXT REFERENCES worlds(id); -- world-specific items
```

### New Tables

```sql
-- Inventories
CREATE TABLE inventories (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL, -- actor_id, location_id, or storage_id
  owner_type TEXT NOT NULL, -- 'actor', 'location', 'storage', 'vehicle'
  name TEXT NOT NULL DEFAULT 'Inventory',
  capacity_weight REAL NOT NULL DEFAULT 50.0,
  capacity_slots INTEGER NOT NULL DEFAULT 20,
  current_weight REAL NOT NULL DEFAULT 0.0,
  current_slots INTEGER NOT NULL DEFAULT 0,
  permissions JSON NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Inventory slots (for equipment)
CREATE TABLE inventory_slots (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL REFERENCES inventories(id),
  slot_type TEXT NOT NULL, -- 'weapon', 'armor', 'accessory', etc.
  item_id TEXT REFERENCES actor_items(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  equipped INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(inventory_id, slot_type)
);

-- Storage containers (at locations)
CREATE TABLE storages (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  capacity_weight REAL NOT NULL DEFAULT 100.0,
  capacity_slots INTEGER NOT NULL DEFAULT 50,
  current_weight REAL NOT NULL DEFAULT 0.0,
  current_slots INTEGER NOT NULL DEFAULT 0,
  security INTEGER NOT NULL DEFAULT 0, -- 0-100, theft protection
  access_control JSON NOT NULL DEFAULT '{}',
  owner_id TEXT REFERENCES actors(id), -- null = public storage
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. Implementation Notes

### Files to Create

| File                            | Purpose                             |
| ------------------------------- | ----------------------------------- |
| `src/inventory/types.ts`        | Inventory type definitions          |
| `src/inventory/manager.ts`      | Core inventory operations           |
| `src/inventory/equipment.ts`    | Equipment slot management           |
| `src/inventory/transfer.ts`     | Item transfer between inventories   |
| `src/inventory/weight.ts`       | Weight and encumbrance calculations |
| `src/inventory/organization.ts` | Sorting, filtering, grouping        |
| `src/db/schema-inventory.ts`    | Inventory schema types              |
| `src/routes/inventory.ts`       | Inventory API routes                |

### Files to Modify

| File                     | Purpose                  |
| ------------------------ | ------------------------ |
| `src/db/schema-story.ts` | Extend actor_items table |
| `src/actors/types.ts`    | Add inventory references |
| `src/routes/actors.ts`   | Add inventory endpoints  |

---

## Reference

| Document                                     | Covers                                      |
| -------------------------------------------- | ------------------------------------------- |
| `docs/spec/items.md`                         | Item definitions, types, properties, rarity |
| `docs/spec/rpg-mechanics.md`                 | Item transfer tools, trading, economy       |
| `docs/spec/actors.md`                        | Actor data model, actor_items table         |
| `docs/spec/character-spec.md`                | Character extensions including inventory    |
| `.plan/epics/epic-item-system-extensions.md` | Item extensions (durability, effects, etc.) |
| `.plan/epics/epic-rpg-mechanics.md`          | RPG inventory system overview               |
