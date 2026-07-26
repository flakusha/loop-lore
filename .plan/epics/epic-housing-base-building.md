# EPIC: Housing & Base Building

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Issue:** `fd70c95`
**Type:** Feature Epic
**Tags:** housing, base-building, decoration, storage, crafting-stations

## Overview

Player housing and base building system — personal homes, guild halls, crafting stations, storage, decoration, and social spaces. Supports multiple housing types from apartments to castles.

## Housing Types

| Type                | Size      | Cost      | Features                      |
| ------------------- | --------- | --------- | ----------------------------- |
| **Apartment**       | Small     | Low       | Basic storage, bed            |
| **Cottage**         | Medium    | Medium    | Small garden, crafting space  |
| **House**           | Large     | High      | Multiple rooms, yard          |
| **Manor**           | Very High | Very High | Estate, servants, stables     |
| **Castle**          | Massive   | Legendary | Fortifications, army quarters |
| **Guild Hall**      | Variable  | Guild     | Shared space, guild bank      |
| **Floating Island** | Variable  | Legendary | Flying base, unique features  |

## Housing Structure

```typescript
interface PlayerHousing {
  id: string;
  owner_id: string;
  type: HousingType;
  name: string;
  location: WorldLocation;
  size: HousingSize;
  rooms: Room[];
  exterior: ExteriorSpace;
  storage: StorageContainer[];
  crafting_stations: CraftingStation[];
  furniture: FurnitureItem[];
  decorations: DecorationItem[];
  security: SecuritySystem;
  visitors: VisitorLog[];
  rent: RentSystem;
}

interface Room {
  id: string;
  name: string;
  type:
    | "bedroom"
    | "kitchen"
    | "workshop"
    | "storage"
    | "trophy"
    | "library"
    | "armory"
    | "garden"
    | "stable"
    | "dungeon";
  size: number; // grid units
  furniture: FurnitureItem[];
  bonuses: RoomBonus[];
  condition: number; // 0-100
}

interface ExteriorSpace {
  type: "yard" | "garden" | "courtyard" | "balcony" | "rooftop" | "underground";
  size: number;
  features: ExteriorFeature[];
  crops?: CropPlot[];
  animals?: AnimalPen[];
}
```

## Building System

### Construction

```typescript
interface ConstructionProject {
  id: string;
  type: "build" | "upgrade" | "repair" | "expand";
  target: HousingTarget;
  materials: ConstructionMaterial[];
  time_required: number; // in hours
  cost: number;
  workers: Worker[];
  progress: number; // 0-100
  quality: number; // 0-100
}

interface ConstructionMaterial {
  item_id: string;
  quantity: number;
  quality_requirement: number;
  contributed: number;
}

interface Worker {
  npc_id: string;
  skill: number;
  speed_modifier: number;
  quality_modifier: number;
}
```

### Blueprint System

```typescript
interface Blueprint {
  id: string;
  name: string;
  type: "room" | "building" | "decoration" | "furniture";
  tier: number;
  materials: ConstructionMaterial[];
  time_required: number;
  skill_required: number;
  result: BuildResult;
  discovered: boolean;
}
```

## Furniture & Decoration

### Furniture Categories

| Category       | Examples                   | Bonuses                |
| -------------- | -------------------------- | ---------------------- |
| **Beds**       | Simple bed, royal bed      | Rest quality, comfort  |
| **Tables**     | Dining table, workbench    | Crafting speed, social |
| **Storage**    | Chest, wardrobe, shelf     | Storage capacity       |
| **Lighting**   | Candle, chandelier, lamp   | Visibility, mood       |
| **Seating**    | Chair, throne, bench       | Comfort, prestige      |
| **Decoration** | Painting, rug, plant       | Aesthetics, morale     |
| **Functional** | Forge, loom, alchemy table | Crafting bonuses       |

### Furniture Structure

```typescript
interface FurnitureItem {
  id: string;
  item_id: string;
  name: string;
  category: FurnitureCategory;
  size: [number, number,]; // grid width, height
  position: Position3D;
  rotation: number;
  condition: number; // 0-100
  bonuses: FurnitureBonus[];
  style: FurnitureStyle;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

interface FurnitureBonus {
  type: "comfort" | "storage" | "crafting" | "social" | "prestige" | "defense";
  value: number;
  condition?: string;
}
```

## Storage System

### Storage Containers

```typescript
interface StorageContainer {
  id: string;
  name: string;
  type: "chest" | "wardrobe" | "vault" | "display" | "refrigerator" | "safe";
  capacity: number;
  items: InventoryItem[];
  access_control: AccessControl;
  security_level: number;
  auto_sort: boolean;
  categories: ItemCategory[];
}

interface AccessControl {
  owner: boolean;
  guild: boolean;
  friends: boolean;
  visitors: boolean;
  public: boolean;
  password?: string;
}
```

## Crafting Stations

### Home Crafting

- **Forge** — Weapon/armor crafting
- **Alchemy Table** — Potion brewing
- **Enchanting Table** — Item enchantment
- **Loom** — Tailoring
- **Kitchen** — Cooking
- **Workbench** — Engineering
- **Jeweler's Bench** — Jewelry crafting

### Station Bonuses

```typescript
interface HomeCraftingBonus {
  station: CraftingStation;
  tier: number;
  location_bonus: number; // +5-25% based on room quality
  material_saving: number; // chance to save materials
  quality_bonus: number; // +quality to crafted items
  speed_bonus: number; // faster crafting
}
```

## Social Features

### Visitor System

```typescript
interface VisitorLog {
  visitor_id: string;
  timestamp: Date;
  duration: number;
  activities: VisitorActivity[];
}

type VisitorActivity = "visited" | "used_station" | "traded" | "decorated" | "raided";

interface HouseParty {
  host_id: string;
  guests: string[];
  activities: PartyActivity[];
  bonuses: PartyBonus[];
  duration: number;
}
```

### Guild Housing

```typescript
interface GuildHall {
  guild_id: string;
  name: string;
  location: WorldLocation;
  size: GuildHallSize;
  rooms: GuildRoom[];
  treasury: GuildBank;
  crafting_stations: CraftingStation[];
  meeting_hall: MeetingHall;
  guild_buffs: GuildBuff[];
  upgrades: GuildUpgrade[];
}
```

## Housing Buffs

### Rest & Comfort

| Comfort Level | Rest Bonus | Duration |
| ------------- | ---------- | -------- |
| **Poor**      | +5% XP     | 1 hour   |
| **Decent**    | +10% XP    | 2 hours  |
| **Good**      | +15% XP    | 3 hours  |
| **Excellent** | +20% XP    | 4 hours  |
| **Luxurious** | +25% XP    | 5 hours  |

### Room Bonuses

| Room Type    | Bonus                       |
| ------------ | --------------------------- |
| **Bedroom**  | Rest quality, comfort       |
| **Kitchen**  | Cooking speed, food quality |
| **Workshop** | Crafting speed, quality     |
| **Library**  | Skill learning speed        |
| **Armory**   | Equipment maintenance       |
| **Garden**   | Herb/farming yield          |
| **Stable**   | Mount happiness, speed      |

## Integration Points

- **Crafting System** — Home crafting stations
- **Inventory System** — Storage management
- **World & Locations** — Housing placement
- **Economy System** — Housing market, rent
- **Social System** — Visiting, parties
- **Guild System** — Guild halls

## Open Questions

- Should housing be instanced or persistent in the world?
- How to handle housing decay if player is inactive?
- Should there be housing PvP (sieges, raids)?
- How to balance housing costs vs. benefits?
- Should housing be tradeable between players?

## Files

- `src/rpg/housing/` — housing system
- `src/rpg/housing/building.ts` — construction
- `src/rpg/housing/rooms.ts` — room management
- `src/rpg/housing/furniture.ts` — furniture system
- `src/rpg/housing/storage.ts` — storage containers
- `src/rpg/housing/crafting.ts` — home crafting
- `src/rpg/housing/social.ts` — visitor system
- `src/rpg/housing/guild.ts` — guild halls
- `src/db/schema-housing.ts` — housing tables
- `src/routes/housing.ts` — housing API

## Related Epics

- **Epic Crafting & Professions** — Crafting stations
- **Epic RPG Mechanics** — Stats, progression
- **Epic World & Locations** — Land placement
- **Epic Social System** — Visiting, parties
- **Epic Guild System** — Guild halls

## Linked Tasks

- TASK-housing-base-building.md
- TASK-housing-neighborhood.md
