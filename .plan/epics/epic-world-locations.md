<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: World & Locations

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High (split into 4 sub-epics)
**Issue:** `136d857`
**Type:** Feature Epic

## Summary

World and location system — overall conditions, lore following/quality investigation on creation, overall style (fantasy, real, cyberpunk, sci-fi, etc.), random location generation, anomalies/effects, item search/generation, unique places, resource extraction, persistent storage, NPC placement/migration/inventories.

> **⚠️ This epic is too large to ship in one pass.** It has been split into 4 sub-epics below. Each sub-epic delivers independently shippable value.

## Sub-Epics

| Sub-Epic                   | Epic File                       | Scope                                                                     | Priority |
| -------------------------- | ------------------------------- | ------------------------------------------------------------------------- | -------- |
| **Travel & Time**          | `epic-world-travel-time.md`     | World conditions, weather/time/season, travel, random location generation | High     |
| **NPCs & Memories**        | `epic-world-npcs.md`            | NPC placement/migration/inventories, NPC memory system                    | High     |
| **Encounters & Resources** | `epic-world-encounters.md`      | Anomalies, resource extraction, item search/generation, unique places     | Medium   |
| **Diplomacy & Karma**      | `epic-world-diplomacy-karma.md` | Factions, reputation/karma, lore-following/quality, world state           | Medium   |

## Slicing Rationale

The original epic had 8 phases and ~100 interface blocks. Splitting into 4 sub-epics allows each to be independently shippable and reduces coupling:

1. **Travel & Time** — Lowest coupling; good first slice. Core infrastructure that other subs depend on.
2. **NPCs & Memories** — Medium coupling; depends on Travel & Time for NPC placement.
3. **Encounters & Resources** — Medium coupling; independent of NPCs.
4. **Diplomacy & Karma** — Highest coupling; depends on NPCs and reputation systems.

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

### Random Encounters

- Random encounter mechanics based on story notes
- Random encounter generation (procedural)
- Assistant/GM-driven encounter creation
- Encounter difficulty scaling
- Encounter types (combat, dialogue, event, puzzle)
- Encounter rewards and consequences
- Encounter history and tracking
- **Travel between locations random encounters**
- Encounter triggers during travel
- Travel-specific encounter types
- Encounter avoidance and mitigation

### Time-Limited Locations

- Location time limits (temporary access)
- Time-limited events at locations
- Location expiration and renewal
- Time-based location changes
- Location availability windows
- Seasonal location access
- Event-based location unlocking

### Global Cataclysms & Events

- World-altering cataclysms
- Natural disasters (earthquakes, floods, volcanic eruptions)
- Magical cataclysms (mana storms, dimensional rifts)
- Political upheavals (wars, revolutions, regime changes)
- Pandemic events
- Technological breakthroughs
- Cultural movements
- Event propagation and impact
- Cataclysm recovery and rebuilding

### Global Memories & Cross-Group Impact

- Global memory system (world remembers all player actions)
- Cross-group impact (actions of one quest group affect another)
- Time lag between events and actual impact
- Reputation spillover between groups
- World state evolution based on player actions
- Historical event tracking
- Global consequence propagation
- Delayed reaction system

### NPC: Monsters & Enemies

- Monster/enemy NPC types
- Monster behavior patterns (aggressive, passive, territorial)
- Monster difficulty scaling by location
- Monster loot tables
- Monster spawning mechanics
- Boss monsters and rare spawns
- Monster migration and territory control

### NPC: Diplomacy

- Diplomatic NPC interactions
- Faction reputation system
- Diplomacy options (negotiate, bribe, threaten, ally)
- Diplomatic consequences
- Alliance and rivalry tracking
- Diplomatic missions and quests
- Peace/war state management

### NPC: Memories & Standing

- NPC memory of player interactions
- NPC memory of world events
- NPC standing with player (hostile→exalted)
- NPC relationship tracking
- NPC emotional state
- NPC grudge/friendship system
- NPC memory decay over time
- NPC memory sharing between NPCs

### World Character Karma & Standing

- Character karma system (good/evil/neutral)
- Reputation tracking per faction/location
- Standing tiers (hostile, unfriendly, neutral, friendly, honored, revered, exalted)
- Karma-based NPC reactions
- Karma-based quest availability
- Karma-based item access
- Karma-based world state changes

### Message Formatting & Language

- World-specific message formatting
- Slang and dialect based on setting
- Language level (formal, casual, archaic, slang)
- NPC speech patterns
- Setting-appropriate terminology
- Character voice consistency
- Cultural references and idioms
- Translation/localization support

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
  type: "fantasy" | "real" | "cyberpunk" | "scifi" | "postapocalyptic" | "custom";
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
  mode: "quest_execution" | "message_count" | "transfers_only" | "real_time";
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
  calculateTravelTime(from: string, to: string, mode: TravelMode,): number;
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
  type: "environmental" | "enemy" | "obstacle" | "event";
  chance: number; // 0-1
  effect: HazardEffect;
  avoidance: AvoidanceMethod;
}

interface TravelResource {
  id: string;
  name: string;
  type: "food" | "water" | "stamina" | "fuel" | "money";
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
  category: "dungeon" | "town" | "wilderness" | "dungeon" | "special";
  subcategory: string;
  generation: "procedural" | "handcrafted" | "hybrid";
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
  type: "positive" | "negative" | "neutral";
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
  quality: "common" | "uncommon" | "rare" | "epic" | "legendary";
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

### Random Encounter System

```typescript
interface RandomEncounter {
  id: string;
  name: string;
  type: "combat" | "dialogue" | "event" | "puzzle" | "trade" | "quest";
  trigger: EncounterTrigger;
  difficulty: number; // 0-100
  requirements: EncounterRequirement[];
  rewards: EncounterReward[];
  consequences: EncounterConsequence[];
  storyNotes: string; // LLM context for generation
  assistantDriven: boolean; // GM/assistant creates encounter
}

interface EncounterTrigger {
  type: "random" | "location_based" | "time_based" | "quest_based" | "story_based" | "travel_based";
  chance: number; // 0-1
  conditions: TriggerCondition[];
  cooldown: number; // seconds between encounters
}

interface TravelEncounter extends RandomEncounter {
  travelPhase: "departure" | "journey" | "arrival";
  distanceTrigger: number; // world units traveled
  locationProximity: string; // near which location
  travelRisk: number; // 0-100
}

interface EncounterContext {
  location: Location;
  party: Party;
  worldState: WorldState;
  recentEvents: WorldEvent[];
  storyNotes: string;
}
```

### Time-Limited Location System

```typescript
interface TimeLimitedLocation {
  locationId: string;
  timeLimit: LocationTimeLimit;
  expiration: LocationExpiration;
  renewal: LocationRenewal;
  changes: LocationChange[];
}

interface LocationTimeLimit {
  type: "temporary" | "event_based" | "seasonal" | "quest_based" | "cataclysm_based";
  duration: number; // world time seconds
  startTime: Date;
  endTime: Date;
  extensions: TimeExtension[];
}

interface LocationExpiration {
  action: "despawn" | "transform" | "lock" | "destroy" | "archive";
  warningTime: number; // seconds before expiration
  warningMessage: string;
  cleanup: CleanupAction[];
}

interface LocationRenewal {
  renewable: boolean;
  conditions: RenewalCondition[];
  cooldown: number; // world time seconds
  cost: RenewalCost;
}

interface LocationChange {
  trigger: "time" | "event" | "player_action" | "cataclysm";
  changeType: "appearance" | "access" | "resources" | "npcs" | "anomalies";
  description: string;
  effects: ChangeEffect[];
}
```

### Global Cataclysm System

```typescript
interface GlobalCataclysm {
  id: string;
  name: string;
  type: "natural" | "magical" | "political" | "technological" | "cultural" | "pandemic";
  severity: number; // 0-100
  duration: number; // world time seconds
  propagation: CataclysmPropagation;
  impact: CataclysmImpact;
  recovery: CataclysmRecovery;
}

interface CataclysmPropagation {
  speed: number; // world units per hour
  radius: number; // world units
  affectedLocations: string[];
  cascadingEffects: CascadingEffect[];
  warningTime: number; // seconds before impact
}

interface CataclysmImpact {
  locationDamage: Map<string, number>; // location ID → damage %
  npcImpact: Map<string, NPCImpact>; // NPC ID → impact
  resourceDepletion: Map<string, number>; // resource ID → depletion %
  infrastructureDamage: Map<string, number>; // structure ID → damage %
  populationImpact: number; // population change %
  economyImpact: number; // economic change %
}

interface CataclysmRecovery {
  autoRecovery: boolean;
  recoveryRate: number; // per world time hour
  playerAssisted: boolean;
  recoveryActions: RecoveryAction[];
  permanentChanges: PermanentChange[];
}

interface GlobalEvent {
  id: string;
  name: string;
  type: "cataclysm" | "celebration" | "discovery" | "invasion" | "festival" | "crisis";
  scope: "local" | "regional" | "global";
  triggers: EventTrigger[];
  effects: EventEffect[];
  duration: number; // world time seconds
  recurring: boolean;
  recurrenceInterval?: number; // world time seconds
}
```

### Global Memory & Cross-Group Impact System

```typescript
interface GlobalMemory {
  worldId: string;
  memories: GlobalMemoryEntry[];
  crossGroupImpacts: CrossGroupImpact[];
  timeLags: TimeLag[];
  reputationSpillover: ReputationSpillover[];
  worldStateEvolution: WorldStateEvolution[];
}

interface GlobalMemoryEntry {
  id: string;
  type: "player_action" | "world_event" | "cataclysm" | "diplomatic" | "economic";
  content: string;
  timestamp: Date;
  importance: number; // 0-100
  participants: string[]; // group/character IDs
  location: string;
  worldStateChange: WorldStateChange;
  propagationDelay: number; // world time seconds
}

interface CrossGroupImpact {
  sourceGroupId: string;
  targetGroupId: string;
  impactType: "reputation" | "resource" | "access" | "hostility" | "alliance";
  magnitude: number; // -100 to 100
  delay: number; // world time seconds
  conditions: ImpactCondition[];
  propagationPath: string[]; // location IDs
}

interface TimeLag {
  eventId: string;
  actualImpactTime: Date;
  perceivedImpactTime: Date;
  lagDuration: number; // world time seconds
  lagReason: string;
  propagationFactors: PropagationFactor[];
}

interface ReputationSpillover {
  sourceGroup: string;
  targetGroup: string;
  spilloverType: "positive" | "negative" | "neutral";
  magnitude: number; // 0-100
  decayRate: number; // per world time hour
  conditions: SpilloverCondition[];
}

interface WorldStateEvolution {
  evolutionType: "gradual" | "sudden" | "cascading" | "cyclical";
  triggers: EvolutionTrigger[];
  changes: EvolutionChange[];
  timeline: EvolutionTimeline[];
  reversibility: boolean;
}
```

### Global Consequence Propagation

```typescript
interface ConsequencePropagation {
  sourceEvent: string;
  propagationChain: PropagationStep[];
  finalImpact: FinalImpact;
  totalDelay: number; // world time seconds
  visibility: "immediate" | "delayed" | "hidden";
}

interface PropagationStep {
  stepNumber: number;
  location: string;
  delay: number; // world time seconds
  effect: PropagationEffect;
  amplification: number; // 0-2 (1 = normal)
  dampening: number; // 0-1 (1 = fully dampened)
}

interface FinalImpact {
  location: string;
  effect: string;
  magnitude: number; // 0-100
  duration: number; // world time seconds
  reversibility: boolean;
  recoveryActions: string[];
}
```

### Monster & Enemy System

```typescript
interface Monster {
  id: string;
  name: string;
  type: MonsterType;
  difficulty: number; // 0-100
  behavior: MonsterBehavior;
  stats: MonsterStats;
  lootTable: LootTable;
  spawnConditions: SpawnCondition[];
  territory: Territory;
  migration: MonsterMigration;
}

interface MonsterType {
  category: "beast" | "humanoid" | "undead" | "elemental" | "dragon" | "custom";
  subcategory: string;
  size: "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
  alignment: "lawful" | "neutral" | "chaotic";
}

interface MonsterBehavior {
  aggression: number; // 0-100
  intelligence: number; // 0-100
  packBehavior: boolean;
  territorial: boolean;
  nocturnal: boolean;
  huntingPattern: "ambush" | "patrol" | "nest" | "migration";
}

interface MonsterStats {
  health: number;
  damage: number;
  defense: number;
  speed: number;
  abilities: MonsterAbility[];
  resistances: DamageResistance[];
  weaknesses: DamageWeakness[];
}

interface MonsterMigration {
  canMigrate: boolean;
  preferredLocations: string[];
  migrationTriggers: MigrationTrigger[];
  migrationChance: number; // 0-1
  packSize: number;
}
```

### Diplomacy System

```typescript
interface DiplomacySystem {
  factions: Faction[];
  relationships: FactionRelationship[];
  diplomaticActions: DiplomaticAction[];
  alliances: Alliance[];
  wars: War[];
}

interface Faction {
  id: string;
  name: string;
  description: string;
  alignment: Alignment;
  values: FactionValue[];
  territory: string[];
  leaders: string[]; // NPC IDs
  members: string[]; // NPC IDs
}

interface FactionRelationship {
  factionA: string;
  factionB: string;
  standing: number; // -100 to 100
  status: "allied" | "friendly" | "neutral" | "unfriendly" | "hostile" | "at_war";
  history: RelationshipEvent[];
}

interface DiplomaticAction {
  id: string;
  name: string;
  type: "negotiate" | "bribe" | "threaten" | "ally" | "declare_war" | "peace_treaty" | "trade_agreement";
  requirements: DiplomaticRequirement[];
  effects: DiplomaticEffect[];
  consequences: DiplomaticConsequence[];
}

interface Alliance {
  id: string;
  factions: string[];
  type: "defensive" | "offensive" | "trade" | "research";
  terms: AllianceTerms;
  status: "active" | "broken" | "proposed";
  duration: number; // world time seconds
}
```

### Karma & Standing System

```typescript
interface KarmaSystem {
  characterKarma: CharacterKarma;
  factionStanding: FactionStanding[];
  worldReputation: WorldReputation;
  karmaEffects: KarmaEffect[];
}

interface CharacterKarma {
  overall: number; // -100 (evil) to 100 (good)
  categories: KarmaCategory[];
  history: KarmaEvent[];
  tier: KarmaTier;
}

interface KarmaCategory {
  name: string;
  value: number; // -100 to 100
  description: string;
}

interface KarmaTier {
  name: string; // 'saint', 'hero', 'neutral', 'villain', 'tyrant'
  threshold: number;
  effects: KarmaTierEffect[];
}

interface FactionStanding {
  factionId: string;
  standing: number; // -100 to 100
  tier: StandingTier;
  history: StandingEvent[];
  questsCompleted: number;
  questsFailed: number;
  itemsTraded: number;
  enemiesKilled: number;
}

interface StandingTier {
  name: string; // 'exalted', 'revered', 'honored', 'friendly', 'neutral', 'unfriendly', 'hostile'
  threshold: number;
  effects: StandingTierEffect[];
}

interface WorldReputation {
  overall: number; // -100 to 100
  categories: ReputationCategory[];
  titles: string[];
  achievements: string[];
}

interface KarmaEffect {
  type: "npc_reaction" | "quest_availability" | "item_access" | "price_modifier" | "world_state";
  condition: KarmaCondition;
  effect: KarmaEffectValue;
}
```

### NPC Memory System

```typescript
interface NPCMemory {
  npcId: string;
  memories: Memory[];
  emotionalState: EmotionalState;
  relationships: NPCRelationship[];
  grudges: Grudge[];
  friendships: Friendship[];
  memoryDecay: MemoryDecayConfig;
}

interface Memory {
  id: string;
  type: "interaction" | "event" | "observation" | "rumor";
  content: string;
  timestamp: Date;
  importance: number; // 0-100
  emotionalImpact: number; // -100 to 100
  participants: string[]; // character/NPC IDs
  location: string;
  decayRate: number; // how fast memory fades
  shared: boolean; // shared with other NPCs
}

interface EmotionalState {
  happiness: number; // -100 to 100
  anger: number; // -100 to 100
  fear: number; // -100 to 100
  sadness: number; // -100 to 100
  surprise: number; // -100 to 100
  disgust: number; // -100 to 100
  trust: number; // -100 to 100
  dominant: string; // dominant emotion
}

interface NPCRelationship {
  targetId: string; // character/NPC ID
  standing: number; // -100 to 100
  type: "stranger" | "acquaintance" | "friend" | "ally" | "rival" | "enemy";
  history: RelationshipEvent[];
  lastInteraction: Date;
  emotionalBond: number; // -100 to 100
}

interface Grudge {
  targetId: string;
  reason: string;
  intensity: number; // 0-100
  timestamp: Date;
  resolved: boolean;
  resolution?: string;
}

interface Friendship {
  targetId: string;
  level: number; // 0-100
  sharedExperiences: string[];
  trust: number; // 0-100
  loyalty: number; // 0-100
}

interface MemoryDecayConfig {
  baseDecayRate: number; // per day
  importanceMultiplier: number; // important memories decay slower
  emotionalMultiplier: number; // emotional memories decay slower
  sharedMemoryBonus: number; // shared memories decay slower
  reinforcementThreshold: number; // reinforced memories don't decay
}
```

### Message Formatting System

```typescript
interface MessageFormatting {
  worldId: string;
  style: WorldStyle;
  language: LanguageConfig;
  npcSpeech: NPCSpeechConfig;
  formatting: FormattingRules;
}

interface LanguageConfig {
  level: "formal" | "casual" | "archaic" | "slang" | "technical" | "poetic";
  dialect: string;
  slang: SlangDictionary;
  idioms: IdiomDictionary;
  culturalReferences: CulturalReference[];
  terminology: TerminologySet;
}

interface SlangDictionary {
  [word: string]: {
    meaning: string;
    usage: "common" | "rare" | "archaic" | "regional";
    context: string;
    alternatives: string[];
  };
}

interface IdiomDictionary {
  [idiom: string]: {
    meaning: string;
    origin: string;
    usage: string;
    alternatives: string[];
  };
}

interface CulturalReference {
  id: string;
  name: string;
  description: string;
  usage: string;
  context: string;
  alternatives: string[];
}

interface TerminologySet {
  [term: string]: {
    definition: string;
    category: string;
    synonyms: string[];
    antonyms: string[];
    usage: string;
  };
}

interface NPCSpeechConfig {
  patterns: SpeechPattern[];
  vocabulary: VocabularyLevel;
  grammar: GrammarRules;
  pronunciation: PronunciationRules;
  accent: AccentConfig;
}

interface SpeechPattern {
  id: string;
  name: string;
  pattern: string; // regex or template
  usage: "common" | "rare" | "archaic" | "regional";
  context: string;
  examples: string[];
}

interface VocabularyLevel {
  level: "simple" | "moderate" | "complex" | "archaic" | "technical";
  wordChoice: "common" | "formal" | "slang" | "poetic";
  sentenceStructure: "simple" | "complex" | "mixed";
}

interface GrammarRules {
  tense: "past" | "present" | "future" | "mixed";
  person: "first" | "second" | "third" | "mixed";
  formality: "formal" | "casual" | "mixed";
  contractions: boolean;
  slang: boolean;
}

interface PronunciationRules {
  accent: string;
  emphasis: "standard" | "regional" | "foreign";
  mispronunciations: string[];
  speechImpediments: string[];
}

interface AccentConfig {
  type: "standard" | "regional" | "foreign" | "fictional";
  name: string;
  description: string;
  examples: string[];
}

interface FormattingRules {
  messageLength: "short" | "medium" | "long" | "variable";
  punctuation: "standard" | "minimal" | "excessive";
  capitalization: "standard" | "all_caps" | "lowercase" | "mixed";
  emojis: boolean;
  abbreviations: boolean;
  slang: boolean;
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
- [ ] Implement random encounter system
- [ ] Implement travel-based random encounters
- [ ] Implement time-limited locations
- [ ] Implement global cataclysms & events
- [ ] Implement global memory system
- [ ] Implement cross-group impact system
- [ ] Implement time lag system
- [ ] Implement reputation spillover
- [ ] Implement world state evolution
- [ ] Implement consequence propagation
- [ ] Implement monster/enemy NPC system
- [ ] Implement diplomacy system
- [ ] Implement NPC memory system
- [ ] Implement NPC emotional state
- [ ] Implement NPC relationships (grudges, friendships)
- [ ] Implement memory decay system
- [ ] Implement message formatting system
- [ ] Implement slang/dialect system
- [ ] Implement NPC speech patterns
- [ ] Implement world-specific terminology
- [ ] Implement karma and standing system
- [ ] Implement game-inspired systems (radiant quests, crime/bounty, faction reputation, etc.)
- [ ] Create world management UI
- [ ] Create location explorer UI
- [ ] Create travel UI
- [ ] Create time tracking UI
- [ ] Create anomaly interaction UI
- [ ] Create resource extraction UI
- [ ] Create persistent storage UI
- [ ] Create NPC management UI
- [ ] Create random encounter UI
- [ ] Create monster compendium UI
- [ ] Create diplomacy UI
- [ ] Create NPC memory/relationship UI
- [ ] Create karma/standing UI
- [ ] Create cataclysm event UI
- [ ] Create global memory UI
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

### Random Encounters

- How often should random encounters occur?
- Should encounters be purely random or story-driven?
- How to balance encounter difficulty?
- Should encounters be visible or hidden?
- How to handle encounter avoidance?

### Monsters & Enemies

- How many monster types per world is reasonable?
- Should monsters have persistent territories?
- How to handle monster respawning?
- Should monsters drop loot based on difficulty?
- How to balance boss monsters?

### Diplomacy

- How many factions per world is reasonable?
- Should diplomacy be player-driven or automated?
- How to handle faction wars?
- Should diplomacy affect NPC behavior?
- How to balance diplomatic options?

### Karma & Standing

- How visible should karma be to players?
- Should karma affect NPC reactions?
- How to handle karma resets?
- Should standing be per-faction or global?
- How to balance karma effects?

### NPC Memories

- How many memories per NPC is reasonable?
- How fast should memories decay?
- Should NPCs share memories with each other?
- How to handle NPC emotional state changes?
- Should NPCs remember player actions across sessions?

### Message Formatting

- How to balance slang vs. readability?
- Should slang be world-specific or character-specific?
- How to handle language level changes?
- Should formatting be automatic or player-controlled?
- How to maintain character voice consistency?

### Travel Encounters

- How often should travel encounters occur?
- Should encounters be based on travel distance or time?
- How to handle encounter avoidance during travel?
- Should travel encounters be different from location encounters?
- How to balance travel risk vs. reward?

### Time-Limited Locations

- How long should temporary locations last?
- Should players be warned before location expiration?
- How to handle items/NPCs in expiring locations?
- Should locations be renewable?
- How to balance temporary vs. permanent locations?

### Global Cataclysms

- How often should cataclysms occur?
- Should cataclysms be predictable or random?
- How to handle cataclysm recovery?
- Should cataclysms have permanent effects?
- How to balance cataclysm severity?

### Global Memories & Cross-Group Impact

- How long should global memories persist?
- How to handle time lag between events and impact?
- Should cross-group impact be visible to players?
- How to balance reputation spillover?
- Should world state evolution be automatic or player-driven?
- How to handle conflicting actions from different groups?

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

### Phase 5: Encounters & Combat

- Random encounter system
- Monster/enemy NPC system
- Combat mechanics integration
- Loot and rewards

### Phase 6: Diplomacy & Karma

- Faction system
- Diplomacy mechanics
- Karma and standing system
- World state management

### Phase 7: Game-Inspired Systems

- Radiant quest system
- Crime & bounty system
- Faction reputation
- Monster contracts
- Camp/rest system
- Settlement building

### Phase 8: Polish & Integration

- UI/UX refinement
- Performance optimization
- World sharing
- Documentation

## Related Epics

- **Epic Platform Research** — world style / style-specific asset & NPC generation are adoption candidates tracked there.
- **Epic RPG Mechanics** — world-level modifiers, factions, reputation/karma overlap; RPG owns the mechanics, this epic owns location/world data.
- **Epic Battle & Action Systems** — encounters, monsters, and location-based random encounters overlap; battle owns combat flow.
- **Epic 27 (Data Integrity & ACID)** — persistent world/location storage relies on `data_version` concurrency guards once enforced.

## Linked Tasks

- TASK-world-locations.md
- TASK-world-event-system.md
- TASK-random-encounters-events.md
