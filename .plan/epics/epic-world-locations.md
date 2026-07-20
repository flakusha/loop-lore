# EPIC: World & Locations

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Type:** Feature Epic

## Summary

World and location system — overall conditions, lore following/quality investigation on creation, overall style (fantasy, real, cyberpunk, sci-fi, etc.), random location generation, anomalies/effects, item search/generation, unique places, resource extraction, persistent storage, NPC placement/migration/inventories.

## Core Features

### World Conditions
- Global world state and settings
- Environmental conditions (weather, time of day, season)
- World-level modifiers and effects
- World history and progression

### Lore Following / Quality Investigation
- Lore consistency checking on creation
- Quality assessment of generated content
- Lore conflict detection
- Lore enrichment suggestions

### World Style
- Fantasy, real, cyberpunk, sci-fi, etc.
- Style-specific asset generation
- Style-specific NPC behavior
- Style-specific item properties

### No Quality Check — Random Locations
- Random location generation without strict quality gates
- Procedural generation algorithms
- Location variety and uniqueness
- Emergent gameplay from random generation

### Anomalies & Effects
- Location-specific anomalies (positive/negative)
- Environmental effects on characters
- Temporary and permanent anomalies
- Anomaly discovery and interaction

### Item Search & Generation
- Location-specific item discovery
- Procedural item generation
- Unique item placement
- Item rarity based on location

### Unique Places Generation
- Procedural unique location generation
- Named locations with special properties
- Landmark generation
- Secret/hidden locations

### Resource Extraction
- Exploitable resources per location
- Resource extraction mechanics
- Resource regeneration over time
- Resource quality and rarity

### Persistent Storage
- Persistent item storage at locations
- Re-visiting locations retains items
- Storage capacity limits
- Storage security (theft protection)

### NPC Placement & Migration
- NPC placement at locations
- NPC migration between locations
- NPC inventories and trading
- NPC behavior and schedules

## Design

### World Structure

```typescript
interface World {
  id: string;
  name: string;
  style: WorldStyle;
  conditions: WorldConditions;
  lore: WorldLore;
  locations: Location[];
  npcs: NPC[];
  resources: Resource[];
  anomalies: Anomaly[];
}

interface WorldStyle {
  type: 'fantasy' | 'real' | 'cyberpunk' | 'scifi' | 'postapocalyptic' | 'custom';
  substyle?: string;
  assetSet: string;
  npcBehaviorSet: string;
  itemPropertySet: string;
}

interface WorldConditions {
  weather: WeatherState;
  timeOfDay: TimeOfDay;
  season: Season;
  globalModifiers: Modifier[];
  history: WorldEvent[];
}
```

### Location Structure

```typescript
interface Location {
  id: string;
  worldId: string;
  name: string;
  type: LocationType;
  style: LocationStyle;
  conditions: LocationConditions;
  anomalies: Anomaly[];
  items: LocationItem[];
  resources: LocationResource[];
  npcs: LocationNPC[];
  storage: PersistentStorage;
  discovered: boolean;
  unique: boolean;
}

interface LocationType {
  category: 'dungeon' | 'town' | 'wilderness' | 'dungeon' | 'special';
  subcategory: string;
  generation: 'procedural' | 'handcrafted' | 'hybrid';
}

interface LocationConditions {
  dangerLevel: number; // 0-100
  explorationProgress: number; // 0-100
  resourcesRemaining: number; // 0-100
  npcPresence: number; // 0-100
  anomalyStrength: number; // 0-100
}
```

### Anomaly System

```typescript
interface Anomaly {
  id: string;
  name: string;
  type: 'positive' | 'negative' | 'neutral';
  effect: AnomalyEffect;
  duration: number; // seconds, -1 for permanent
  discoveryChance: number; // 0-1
  interactionRequired: boolean;
}

interface AnomalyEffect {
  statModifiers: Record<string, number>;
  damageOverTime?: number;
  healingOverTime?: number;
  experienceMultiplier?: number;
  lootMultiplier?: number;
  specialEffects: string[];
}
```

### Resource System

```typescript
interface LocationResource {
  id: string;
  resourceId: string;
  quantity: number;
  quality: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  regenerationRate: number; // per hour
  extractionDifficulty: number; // 0-100
  discovered: boolean;
}

interface PersistentStorage {
  id: string;
  locationId: string;
  capacity: number;
  items: StoredItem[];
  security: number; // 0-100, theft protection
  accessControl: AccessControl;
}
```

### NPC System

```typescript
interface LocationNPC {
  id: string;
  npcId: string;
  locationId: string;
  behavior: NPCBehavior;
  inventory: NPCInventory;
  schedule: NPCSchedule;
  migration: NPCMigration;
}

interface NPCBehavior {
  aggression: number; // 0-100
  helpfulness: number; // 0-100
  curiosity: number; // 0-100
  schedule: DailySchedule;
}

interface NPCMigration {
  canMigrate: boolean;
  preferredLocations: string[];
  migrationTriggers: MigrationTrigger[];
  migrationChance: number; // 0-1
}
```

## Tasks

- [ ] Design world data model
- [ ] Implement world conditions system
- [ ] Implement lore following/quality investigation
- [ ] Implement world style system
- [ ] Implement random location generation
- [ ] Implement anomaly system
- [ ] Implement item search/generation
- [ ] Implement unique places generation
- [ ] Implement resource extraction system
- [ ] Implement persistent storage
- [ ] Implement NPC placement system
- [ ] Implement NPC migration system
- [ ] Implement NPC inventories
- [ ] Create world management UI
- [ ] Create location explorer UI
- [ ] Create anomaly interaction UI
- [ ] Create resource extraction UI
- [ ] Create persistent storage UI
- [ ] Create NPC management UI
- [ ] Write tests for world system

## Files

- `src/world/` — world system (does not exist yet)
- `src/world/world.ts` — world management
- `src/world/location.ts` — location system
- `src/world/anomaly.ts` — anomaly system
- `src/world/resources.ts` — resource system
- `src/world/storage.ts` — persistent storage
- `src/world/npc.ts` — NPC placement/migration
- `src/world/generation.ts` — procedural generation
- `src/db/schema-world.ts` — world tables
- `src/routes/world.ts` — world API
- `src/frontend/world/` — world UI components

## Open Questions

### World Generation
- How to balance procedural vs. handcrafted content?
- Should worlds be finite or infinite?
- How to handle world persistence across sessions?
- Should worlds be shareable between players?

### Location Generation
- How many locations per world is optimal?
- Should locations have prerequisites for discovery?
- How to handle location revisiting?
- Should locations change over time?

### Anomalies
- How many anomalies per location is reasonable?
- Should anomalies be visible or hidden?
- How to handle anomaly stacking?
- Should anomalies affect NPCs differently?

### Resources
- How to balance resource regeneration rates?
- Should resources be finite or infinite?
- How to handle resource competition between players?
- Should resources have quality tiers?

### NPCs
- How many NPCs per location is reasonable?
- Should NPCs have persistent inventories?
- How to handle NPC death?
- Should NPCs remember player interactions?

### Persistent Storage
- How much storage per location is reasonable?
- Should storage be accessible to all players?
- How to handle storage theft?
- Should storage have maintenance costs?

## Implementation Phases

### Phase 1: Core World
- World data model
- World conditions
- World style system
- Basic location generation

### Phase 2: Location Features
- Anomaly system
- Resource extraction
- Item search/generation
- Unique places generation

### Phase 3: Persistence & NPCs
- Persistent storage
- NPC placement
- NPC migration
- NPC inventories

### Phase 4: Polish & Integration
- UI/UX refinement
- Performance optimization
- World sharing
- Documentation
