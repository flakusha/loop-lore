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

### Distance & Time Travel
- Distance calculation between locations
- Travel time estimation
- Travel mechanics (walking, riding, flying, teleportation)
- Travel hazards and encounters
- Fast travel unlock system
- Travel resource consumption (food, water, stamina)

### Time Tracking & Progression
- Time tracking in locations/world
- Time progression based on:
  - Quest execution (main/side quests)
  - Message count (time attack mode)
  - Location transfers only
- Connection with global objectives
- Time-based events and triggers
- Day/night cycle effects
- Seasonal changes
- Time-limited quests/events

## Game-Inspired Expansions

### From Skyrim/Bethesda Games
- **Radiant Quest System**: Procedurally generated quests based on location/state
- **Crime & Bounty System**: Criminal actions tracked, bounty hunters
- **Faction Reputation**: Standing with different factions affects gameplay
- **Hearthfire Housing**: Player-owned locations, customization, storage
- **Dragon Breaks**: World-altering events, timeline changes

### From The Witcher 3
- **Monster Contracts**: Bounty hunting system
- **Gwent-style Mini-games**: In-world card/board games
- **Question Mark Exploration**: Hidden locations to discover
- **Sunset/Sunrise Mechanics**: Time affects NPC behavior and quests
- **Mutagen System**: Character modification through world exploration

### From Dark Souls/Elden Ring
- **Bonfire System**: Checkpoint/rest locations
- **Soul/Run Retrieval**: Death mechanics, item recovery
- **World Tendency**: World state affects difficulty and NPCs
- **Illusory Walls**: Hidden paths and secrets
- **Message System**: Player-created hints in world

### From Minecraft/Sandbox Games
- **Biome System**: Different terrain types with unique resources
- **Redstone-style Logic**: Location-based triggers and circuits
- **Villager Trading**: NPC economy and trading
- **Enchanting/Anvil**: Item enhancement at specific locations
- **Nether/End Dimensions**: Alternative world layers

### From Baldur's Gate 3
- **Camp System**: Rest/recuperation locations
- **Companion Approval**: NPC relationship tracking
- **Inspiration System**: Bonus for creative solutions
- **Illithid Powers**: Special abilities with world consequences
- **Tadpole System**: Infection/progression mechanics

### From Fallout Series
- **V.A.T.S. System**: Targeted combat mechanics
- **S.P.E.C.I.A.L. Stats**: Character creation and progression
- **Settlement Building**: Player-created locations
- **Radiation System**: Environmental hazard tracking
- **Companion Loyalty**: Deep NPC relationship system

### From MMOs (WoW, FFXIV)
- **Dungeon Finder**: Location matchmaking system
- **World Bosses**: Shared world events
- **Daily/Weekly Quests**: Recurring objectives
- **Reputation Grinds**: Faction standing progression
- **Mount System**: Travel companions and speed

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
  timeTracking: WorldTimeTracking;
  travelSystem: TravelSystem;
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

### Time Tracking System

```typescript
interface WorldTimeTracking {
  mode: 'quest_execution' | 'message_count' | 'transfers_only' | 'real_time';
  currentTime: WorldTime;
  timeScale: number; // 1 real second = X world minutes
  questTimeTracking: QuestTimeTracking;
  messageTimeTracking: MessageTimeTracking;
  globalObjectives: GlobalObjective[];
}

interface WorldTime {
  day: number;
  hour: number;
  minute: number;
  season: Season;
  year: number;
}

interface QuestTimeTracking {
  mainQuestTime: number; // total time spent on main quests
  sideQuestTime: number; // total time spent on side quests
  activeQuestTime: number; // time on current quest
  questTimeLimits: Map<string, number>; // quest ID → time limit
}

interface MessageTimeTracking {
  messagesPerTimeUnit: number; // messages = time progression
  transferTimeOnly: boolean; // only count transfers
  timeAttackMode: boolean; // time attack mode
  messageThreshold: number; // messages before time advances
}

interface GlobalObjective {
  id: string;
  name: string;
  description: string;
  timeLimit?: number; // world time seconds
  progress: number; // 0-100
  completed: boolean;
  consequences: ObjectiveConsequence[];
}
```

### Travel System

```typescript
interface TravelSystem {
  distanceMatrix: DistanceMatrix;
  travelModes: TravelMode[];
  fastTravel: FastTravelSystem;
  travelHazards: TravelHazard[];
  travelResources: TravelResource[];
}

interface DistanceMatrix {
  // Location A → Location B → distance in world units
  distances: Map<string, Map<string, number>>;
  // Travel time calculation
  calculateTravelTime(from: string, to: string, mode: TravelMode): number;
}

interface TravelMode {
  id: string;
  name: string;
  speed: number; // world units per hour
  requirements: TravelRequirement[];
  hazards: string[]; // hazard IDs
  resourceCost: TravelResourceCost;
}

interface FastTravelSystem {
  unlockedLocations: string[]; // location IDs
  unlockRequirements: Map<string, UnlockRequirement>;
  travelCost: Map<string, number>; // location ID → cost
  cooldown: Map<string, number>; // location ID → cooldown seconds
}

interface TravelHazard {
  id: string;
  name: string;
  type: 'environmental' | 'enemy' | 'obstacle' | 'event';
  chance: number; // 0-1
  effect: HazardEffect;
  avoidance: AvoidanceMethod;
}

interface TravelResource {
  id: string;
  name: string;
  type: 'food' | 'water' | 'stamina' | 'fuel' | 'money';
  consumptionRate: number; // per world unit traveled
  replenishMethod: string;
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
  travelConnections: TravelConnection[];
  timeEvents: TimeEvent[];
}

interface TravelConnection {
  targetLocationId: string;
  distance: number; // world units
  travelModes: string[]; // travel mode IDs
  hazards: string[]; // hazard IDs
  discovered: boolean;
}

interface TimeEvent {
  id: string;
  name: string;
  trigger: TimeTrigger;
  effect: TimeEffect;
  recurring: boolean;
  interval?: number; // world time seconds
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
- [ ] Implement distance calculation system
- [ ] Implement travel time estimation
- [ ] Implement travel mechanics (walking, riding, flying, teleportation)
- [ ] Implement travel hazards and encounters
- [ ] Implement fast travel unlock system
- [ ] Implement travel resource consumption
- [ ] Implement time tracking system
- [ ] Implement quest-based time progression
- [ ] Implement message-based time progression (time attack)
- [ ] Implement transfer-based time progression
- [ ] Implement global objectives with time limits
- [ ] Implement day/night cycle effects
- [ ] Implement seasonal changes
- [ ] Implement time-limited quests/events
- [ ] Implement game-inspired systems (radiant quests, crime/bounty, faction reputation, etc.)
- [ ] Create world management UI
- [ ] Create location explorer UI
- [ ] Create travel UI
- [ ] Create time tracking UI
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

### Distance & Travel
- How to calculate distance between locations (Euclidean, Manhattan, graph-based)?
- Should travel time be real-time or accelerated?
- How to handle travel interruptions (combat, events)?
- Should fast travel have a cost or cooldown?
- How to balance travel speed vs. world size?

### Time Tracking
- What triggers time progression (quests, messages, transfers, real-time)?
- How to balance time scale (1 real second = X world minutes)?
- Should time tracking be visible to players or hidden?
- How to handle time-limited quests (failure conditions)?
- Should time affect NPC behavior and schedules?

### Game-Inspired Systems
- Which game systems are most applicable to loop-lore?
- How to adapt single-player mechanics for multiplayer/chat?
- Should game systems be optional or mandatory?
- How to balance complexity vs. accessibility?
- Should game systems be plugin-based or core?

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

### Phase 4: Travel & Time
- Distance calculation
- Travel mechanics
- Fast travel system
- Time tracking system
- Quest/message/transfer time progression
- Global objectives with time limits

### Phase 5: Game-Inspired Systems
- Radiant quest system
- Crime & bounty system
- Faction reputation
- Monster contracts
- Camp/rest system
- Settlement building

### Phase 6: Polish & Integration
- UI/UX refinement
- Performance optimization
- World sharing
- Documentation
