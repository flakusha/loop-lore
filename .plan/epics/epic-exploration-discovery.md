# EPIC: Exploration & Discovery Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** exploration, discovery, mapping, navigation, secrets, rewards

## Overview

Exploration and discovery mechanics — map exploration, fog of war, discovery rewards, navigation, cartography, and hidden content. Supports both guided and freeform exploration.

## Map System

### Map Structure

```typescript
interface GameMap {
  id: string;
  name: string;
  region: string;
  tiles: MapTile[][];
  size: MapSize;
  discovered: boolean;
  exploration_progress: number; // 0-100
  points_of_interest: PointOfInterest[];
  secrets: Secret[];
  landmarks: Landmark[];
}

interface MapTile {
  x: number;
  y: number;
  terrain: TerrainType;
  elevation: number;
  visibility: VisibilityLevel;
  discovered: boolean;
  visited: boolean;
  marked: boolean;
  notes: string;
}

type VisibilityLevel = "hidden" | "fog" | "visible" | "revealed";
```

### Fog of War

```typescript
interface FogOfWar {
  character_id: string;
  map_id: string;
  revealed_tiles: RevealedTile[];
  vision_radius: number;
  vision_type: VisionType;
  permanent_reveals: PermanentReveal[];
}

interface RevealedTile {
  x: number;
  y: number;
  revealed_by: "vision" | "scout" | "magic" | "item" | "quest";
  reveal_time: Date;
  persistence: "temporary" | "permanent";
}

type VisionType = "normal" | "darkvision" | "truesight" | "tremorsense" | "blindsight";
```

## Discovery System

### Discovery Types

| Type              | Description         | Rewards        |
| ----------------- | ------------------- | -------------- |
| **Location**      | New area discovered | XP, map marker |
| **Secret Area**   | Hidden room/zone    | Loot, quest    |
| **Landmark**      | Notable feature     | XP, lore       |
| **Resource Node** | Gathering spot      | Materials      |
| **Dungeon**       | Dungeon entrance    | Dungeon access |
| **NPC**           | Hidden NPC          | Quest, trade   |
| **Lore**          | Story fragment      | Knowledge, XP  |
| **Treasure**      | Hidden cache        | Valuables      |

### Discovery Structure

```typescript
interface Discovery {
  id: string;
  name: string;
  type: DiscoveryType;
  location: WorldLocation;
  discovery_chance: number; // 0-100
  requirements: DiscoveryRequirement[];
  rewards: DiscoveryReward[];
  discovered: boolean;
  discovery_time?: Date;
  discovered_by?: string;
}

interface DiscoveryRequirement {
  type: "skill" | "item" | "quest" | "level" | "perception" | "magic";
  value: number | string;
  description: string;
}

interface DiscoveryReward {
  type: "xp" | "item" | "currency" | "lore" | "reputation" | "unlock";
  value: number | string;
  rarity?: Rarity;
}
```

### Discovery Checks

```typescript
interface DiscoveryCheck {
  explorer: Character;
  location: WorldLocation;
  skill: string;
  dc: number;
  modifiers: DiscoveryModifier[];
  result: DiscoveryResult;
}

interface DiscoveryModifier {
  type: "perception" | "skill" | "item" | "magic" | "race" | "class";
  value: number;
  source: string;
}

interface DiscoveryResult {
  success: boolean;
  discoveries: Discovery[];
  xp_gained: number;
  items_found: Item[];
  lore_unlocked: LoreEntry[];
}
```

## Navigation System

### Navigation Mechanics

```typescript
interface Navigation {
  navigator: Character;
  destination: WorldLocation;
  current_position: WorldLocation;
  route: NavigationRoute;
  difficulty: number;
  terrain: TerrainType[];
  hazards: NavigationHazard[];
  estimated_time: number; // in minutes
  actual_time: number;
}

interface NavigationRoute {
  waypoints: WorldLocation[];
  distance: number; // in game units
  terrain_difficulty: number;
  danger_level: number;
  shortcuts: Shortcut[];
  landmarks: Landmark[];
}

interface NavigationHazard {
  type: "terrain" | "weather" | "creature" | "bandit" | "magical";
  severity: number; // 1-10
  avoidance_dc: number;
  consequence: HazardConsequence;
}
```

### Navigation Skills

| Skill           | Effect           | DC Range |
| --------------- | ---------------- | -------- |
| **Pathfinding** | Faster travel    | 10-25    |
| **Cartography** | Map accuracy     | 10-20    |
| **Survival**    | Resource finding | 10-20    |
| **Tracking**    | Following trails | 10-25    |
| **Navigation**  | Direction sense  | 10-20    |
| **Perception**  | Spotting hazards | 10-25    |

## Cartography System

### Map Making

```typescript
interface Cartography {
  cartographer: Character;
  map: GameMap;
  accuracy: number; // 0-100
  detail_level: number; // 1-5
  annotations: MapAnnotation[];
  copies: MapCopy[];
  value: number;
}

interface MapAnnotation {
  x: number;
  y: number;
  type: "note" | "warning" | "resource" | "danger" | "poi";
  text: string;
  icon: string;
}

interface MapCopy {
  copy_id: string;
  owner_id: string;
  accuracy: number;
  shared_with: string[];
}
```

### Map Quality

| Quality          | Accuracy | Detail    | Value       |
| ---------------- | -------- | --------- | ----------- |
| **Rough Sketch** | 20-40%   | Low       | 10-50g      |
| **Basic Map**    | 40-60%   | Medium    | 50-200g     |
| **Detailed Map** | 60-80%   | High      | 200-500g    |
| **Expert Map**   | 80-95%   | Very High | 500-2000g   |
| **Perfect Map**  | 95-100%  | Complete  | 2000-10000g |

## Secret & Hidden Content

### Secret Types

```typescript
interface Secret {
  id: string;
  name: string;
  type: "room" | "passage" | "treasure" | "lore" | "npc" | "quest" | "shortcut";
  location: WorldLocation;
  discovery_dc: number;
  discovery_method: DiscoveryMethod[];
  content: SecretContent;
  discovered: boolean;
  respawn: boolean;
  respawn_time?: number;
}

interface SecretContent {
  items?: Item[];
  lore?: LoreEntry[];
  npc?: NPC;
  quest?: Quest;
  shortcut?: WorldLocation;
  currency?: number;
}
```

### Hidden Content Discovery

| Method               | DC Modifier | Notes                 |
| -------------------- | ----------- | --------------------- |
| **Active Search**    | -5          | Taking time to search |
| **Perception Check** | Base        | Passive awareness     |
| **Magic Detection**  | -10         | Detect magic/hidden   |
| **Item Interaction** | -15         | Using specific items  |
| **NPC Hint**         | -20         | Following clues       |
| **Quest Trigger**    | Auto        | Quest-related         |

## Exploration Rewards

### Exploration XP

| Discovery        | XP Reward |
| ---------------- | --------- |
| New Area         | 10-50     |
| Secret Area      | 50-200    |
| Landmark         | 25-100    |
| Resource Node    | 10-30     |
| Dungeon Entrance | 100-500   |
| Hidden NPC       | 50-150    |
| Lore Fragment    | 25-75     |
| Treasure Cache   | 50-300    |

### Exploration Achievements

```typescript
interface ExplorationAchievement {
  id: string;
  name: string;
  description: string;
  category: "explorer" | "cartographer" | "discoverer" | "adventurer" | "legendary";
  requirements: AchievementRequirement[];
  rewards: AchievementReward[];
  progress: number; // 0-100
}
```

## Travel System

### Travel Mechanics

```typescript
interface Travel {
  party: Character[];
  origin: WorldLocation;
  destination: WorldLocation;
  mode: TravelMode;
  speed: number;
  duration: number; // in minutes
  encounters: TravelEncounter[];
  resources_consumed: ResourceConsumption[];
  arrival_time: Date;
}

type TravelMode = "walking" | "running" | "riding" | "flying" | "swimming" | "teleport" | "vehicle";

interface TravelEncounter {
  type: "combat" | "social" | "discovery" | "hazard" | "rest" | "trade";
  probability: number; // 0-100
  difficulty: number;
  rewards: EncounterReward[];
}
```

### Travel Speed

| Mode         | Base Speed | Terrain Modifier |
| ------------ | ---------- | ---------------- |
| **Walking**  | 3 mph      | -0-50%           |
| **Running**  | 6 mph      | -0-50%           |
| **Horse**    | 8 mph      | -0-30%           |
| **Flying**   | 20 mph     | -0-20%           |
| **Swimming** | 2 mph      | -0-50%           |
| **Teleport** | Instant    | None             |
| **Vehicle**  | 10-30 mph  | -0-40%           |

## Integration Points

- **World & Locations** — Map tiles, terrain, locations
- **RPG Mechanics** — Skills, stats, XP
- **Inventory System** — Maps, compasses, tools
- **Quest System** — Discovery objectives
- **Combat System** — Travel encounters
- **Crafting System** — Map making, tools

## Open Questions

- Should exploration be gated by level/skill?
- How to handle fast travel vs. immersion?
- Should maps be shareable between players?
- How to balance exploration rewards vs. other content?
- Should exploration be required or optional?

## Files

- `src/rpg/exploration/` — exploration system
- `src/rpg/exploration/maps.ts` — map system
- `src/rpg/exploration/fog.ts` — fog of war
- `src/rpg/exploration/discovery.ts` — discovery system
- `src/rpg/exploration/navigation.ts` — navigation
- `src/rpg/exploration/cartography.ts` — map making
- `src/rpg/exploration/secrets.ts` — hidden content
- `src/rpg/exploration/travel.ts` — travel system
- `src/db/schema-exploration.ts` — exploration tables
- `src/routes/exploration.ts` — exploration API

## Related Epics

- **Epic World & Locations** — World map, terrain
- **Epic RPG Mechanics** — Skills, stats, XP
- **Epic Quest System** — Discovery objectives
- **Epic Combat System** — Travel encounters
- **Epic Crafting System** — Map making
