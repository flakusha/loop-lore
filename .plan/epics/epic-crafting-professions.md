# EPIC: Crafting & Professions

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Issue:** `328843b`
**Type:** Feature Epic
**Tags:** crafting, professions, alchemy, smithing, enchanting, cooking, farming

## Overview

Comprehensive crafting and profession system — crafting disciplines, recipe discovery, material gathering, crafting stations, profession progression, and economic integration. Supports multiple crafting paradigms from simple recipe-based to complex experimentation systems.

## Crafting Disciplines

### Core Disciplines

| Discipline      | Description                     | Key Stats | Products                          |
| --------------- | ------------------------------- | --------- | --------------------------------- |
| **Alchemy**     | Potion brewing, poison crafting | INT, WIS  | Potions, poisons, elixirs         |
| **Smithing**    | Weapon & armor forging          | STR, CON  | Weapons, armor, tools             |
| **Enchanting**  | Magical item enhancement        | INT, CHA  | Enchanted items, scrolls          |
| **Cooking**     | Meal preparation, buff food     | WIS, DEX  | Meals, snacks, drinks             |
| **Tailoring**   | Cloth & leather armor           | DEX, INT  | Cloth armor, bags, cloaks         |
| **Woodworking** | Bows, staves, furniture         | DEX, STR  | Ranged weapons, staves, furniture |
| **Jewelry**     | Rings, amulets, gems            | DEX, INT  | Accessories, gem cutting          |
| **Engineering** | Gadgets, mechanisms, traps      | INT, DEX  | Gadgets, traps, mechanical items  |

### Specialized Disciplines

| Discipline    | Description                      | Products                  |
| ------------- | -------------------------------- | ------------------------- |
| **Farming**   | Crop growing, animal husbandry   | Food, materials, reagents |
| **Fishing**   | Fish catching, aquatic resources | Fish, pearls, treasure    |
| **Mining**    | Ore extraction, gem finding      | Ores, gems, stone         |
| **Herbalism** | Herb gathering, plant knowledge  | Herbs, reagents, dyes     |
| **Skinning**  | Animal hide harvesting           | Leather, fur, bones       |
| **Logging**   | Wood harvesting                  | Lumber, branches, sap     |

## Crafting System

### Recipe Structure

```typescript
interface Recipe {
  id: string;
  name: string;
  discipline: CraftingDiscipline;
  tier: number; // 1-10
  level_required: number;
  materials: RecipeMaterial[];
  station_required: CraftingStation;
  crafting_time: number; // in seconds
  success_chance: number;
  quality_range: QualityRange;
  discovered: boolean;
  discovery_method: DiscoveryMethod;
}

interface RecipeMaterial {
  item_id: string;
  quantity: number;
  quality_requirement?: number;
  optional: boolean;
  bonus_effect?: string;
}

interface QualityRange {
  min: number; // 0-100
  max: number;
  perfect_threshold: number;
}
```

### Crafting Stations

```typescript
interface CraftingStation {
  id: string;
  name: string;
  type: "anvil" | "forge" | "workbench" | "cauldron" | "loom" | "furnace" | "kitchen" | "enchanting_table";
  tier: number; // 1-5
  bonuses: CraftingBonus[];
  location: "player_home" | "world" | "guild" | "portable";
  durability: number;
}

interface CraftingBonus {
  type: "speed" | "quality" | "success" | "material_saving";
  value: number;
  condition?: string;
}
```

### Crafting Process

```typescript
interface CraftingAttempt {
  recipe: Recipe;
  crafter: Character;
  station: CraftingStation;
  materials: InventoryItem[];
  skill_level: number;
  luck_modifier: number;
  quality_target: number;
  result: CraftingResult;
}

interface CraftingResult {
  success: boolean;
  item?: CraftedItem;
  quality: number; // 0-100
  bonus_effects: string[];
  materials_lost: InventoryItem[];
  experience_gained: number;
  skill_increase: number;
}
```

## Profession System

### Profession Progression

```typescript
interface Profession {
  id: string;
  name: string;
  discipline: CraftingDiscipline;
  level: number;
  experience: number;
  title: string; // 'Apprentice', 'Journeyman', 'Expert', 'Master', 'Grandmaster'
  specializations: Specialization[];
  unlocks: ProfessionUnlock[];
}

interface Specialization {
  id: string;
  name: string;
  description: string;
  bonuses: SpecializationBonus[];
  requirements: SpecializationRequirement[];
}

interface ProfessionUnlock {
  level: number;
  type: "recipe" | "technique" | "station" | "material" | "title";
  id: string;
  description: string;
}
```

### Profession Titles

| Level | Title       | Bonuses                                  |
| ----- | ----------- | ---------------------------------------- |
| 1-25  | Apprentice  | Basic recipes                            |
| 26-50 | Journeyman  | +5% success, tier 2 recipes              |
| 51-75 | Expert      | +10% quality, tier 3 recipes             |
| 76-99 | Master      | +15% speed, tier 4 recipes               |
| 100   | Grandmaster | +20% all, tier 5 recipes, unique recipes |

### Material Gathering

```typescript
interface GatheringNode {
  id: string;
  name: string;
  type: "ore_vein" | "herb_patch" | "tree" | "fishing_spot" | "animal";
  location: WorldLocation;
  respawn_time: number;
  skill_required: number;
  materials: GatheringMaterial[];
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

interface GatheringMaterial {
  item_id: string;
  quantity_range: [number, number,];
  quality_range: [number, number,];
  drop_chance: number;
}
```

## Recipe Discovery

### Discovery Methods

| Method                  | Description                | Success Rate       |
| ----------------------- | -------------------------- | ------------------ |
| **Experimentation**     | Combine materials randomly | Skill-based        |
| **Recipe Books**        | Learn from written sources | 100%               |
| **NPC Teaching**        | Learn from crafters        | Relationship-based |
| **Quest Rewards**       | Unlock through story       | Guaranteed         |
| **World Discovery**     | Find hidden recipes        | Random             |
| **Reverse Engineering** | Deconstruct existing items | Skill-based        |

### Experimentation System

```typescript
interface Experimentation {
  materials: InventoryItem[];
  station: CraftingStation;
  skill_level: number;
  luck: number;
  possible_results: ExperimentResult[];
  discovery_chance: number;
  failure_effects: FailureEffect[];
}
```

## Economic Integration

### Crafting Economy

- **Material Market** — Buy/sell materials at dynamic prices
- **Crafted Item Market** — Sell crafted items to players/NPCs
- **Supply & Demand** — Prices fluctuate based on availability
- **Crafting Orders** — Players request specific items
- **Guild Workshops** — Shared crafting facilities

### Item Quality

| Quality | Name      | Bonuses                              |
| ------- | --------- | ------------------------------------ |
| 0-20    | Poor      | -20% stats                           |
| 21-40   | Common    | Base stats                           |
| 41-60   | Uncommon  | +10% stats                           |
| 61-80   | Rare      | +25% stats, 1 bonus                  |
| 81-99   | Epic      | +50% stats, 2 bonuses                |
| 100     | Legendary | +75% stats, 3 bonuses, unique effect |

## Integration Points

- **RPG Mechanics** — Stats affect crafting success, quality, speed
- **Inventory System** — Material storage, crafted item management
- **Economy System** — Trading, market, currency
- **World & Locations** — Gathering nodes, crafting stations
- **Plugin System** — Disciplines/recipes extensible

## Open Questions

- Should crafting be instant or time-based?
- How to handle crafting failure (material loss, explosion, etc.)?
- Should crafted items be bind-on-create or tradeable?
- How to balance crafting vs. loot drops?
- Should there be crafting specializations or generalists?

## Files

- `src/rpg/crafting/` — crafting system root
- `src/rpg/crafting/recipes.ts` — recipe definitions
- `src/rpg/crafting/stations.ts` — crafting stations
- `src/rpg/crafting/process.ts` — crafting process
- `src/rpg/crafting/professions.ts` — profession system
- `src/rpg/crafting/gathering.ts` — material gathering
- `src/rpg/crafting/discovery.ts` — recipe discovery
- `src/rpg/crafting/quality.ts` — quality system
- `src/rpg/crafting/economics.ts` — crafting economy
- `src/db/schema-crafting.ts` — crafting tables
- `src/routes/crafting.ts` — crafting API

## Related Epics

- **Epic RPG Mechanics** — Core stats, inventory integration
- **Epic Magic & Spell Systems** — Enchanting, magical crafting
- **Epic World & Locations** — Gathering nodes, crafting stations
- **Epic Battle & Action Systems** — Crafted combat items
- **Epic Plugin System** — Disciplines/recipes extensibility

## Linked Tasks

- TASK-crafting-professions.md
