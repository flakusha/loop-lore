<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: World Encounters & Resources

**Status:** Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** world, encounters, resources, items, anomalies
**Parent Epic:** World & Locations (epic-world-locations.md)

## Summary

Anomalies, resource extraction, item search/generation, and unique places for loop-lore.

## Sub-Epic of

Part of the **World & Locations** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

- Anomalies and effects
- Resource extraction (mining, gathering, fishing)
- Item search and generation
- Unique places generation
- Random encounters and encounter tables
- Persistent storage at locations
- Time-limited locations
- Global cataclysms & events

## Key Integrations

- Item System: resource types, item generation
- Battle System: encounter difficulty balancing
- RPG Mechanics: resource mechanics, XP from gathering
- Faction System: resource control, territory conflicts

## Tasks

- [ ] Implement anomaly system
- [ ] Implement item search/generation
- [ ] Implement unique places generation
- [ ] Implement resource extraction system
- [ ] Implement persistent storage
- [ ] Implement random encounter system
- [ ] Implement global cataclysms & events
- [ ] Create anomaly interaction UI
- [ ] Create resource extraction UI
- [ ] Create persistent storage UI
- [ ] Create random encounter UI
- [ ] Create cataclysm event UI

## Design

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

## Dependencies

- **Parent hub:** `epic-world-locations.md` — owns the shared World/Location core data model.
- **Sibling order:** parallel-safe in sequencing (independent of NPCs); reuses `TravelEncounter` triggers from `epic-world-travel-time.md`.

## Open Questions

- How are encounter tables weighted?
- What triggers unique place generation?
- How do resources affect world economy?
