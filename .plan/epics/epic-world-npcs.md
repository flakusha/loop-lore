<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: World NPCs

**Status:** Not Started
**Priority:** High
**Effort:** High
**Type:** Feature Epic
**Tags:** world, npcs, placement, migration, inventory
**Parent Epic:** World & Locations (epic-world-locations.md)

## Summary

NPC placement, migration, inventories, and NPC memory system for loop-lore.

## Sub-Epic of

Part of the **World & Locations** mega-epic. See parent epic for full scope and slicing rationale.

## Scope

- NPC placement and migration between locations
- NPC inventory and trading
- NPC memory lifecycle (per world vs persistent)
- NPC behavior patterns (aggressive, passive, territorial)
- Monster/enemy NPCs (types, spawning, territories, loot)

## Key Integrations

- Battle System: NPC combat behavior (personality-driven)
- Social Interaction: NPC social dynamics (gossip, reputation)
- Faction System: NPC faction membership
- Item System: NPC inventory, trading, equipment

## Tasks

- [ ] Implement NPC placement system
- [ ] Implement NPC migration system
- [ ] Implement NPC inventories
- [ ] Implement monster/enemy NPC system
- [ ] Implement NPC memory system
- [ ] Implement NPC emotional state
- [ ] Implement NPC relationships (grudges, friendships)
- [ ] Implement memory decay system
- [ ] Create NPC management UI
- [ ] Create monster compendium UI
- [ ] Create NPC memory/relationship UI

## Design

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

## Dependencies

- **Parent hub:** `epic-world-locations.md` — owns the shared World/Location core data model.
- **Sibling order:** second in sequencing; depends on `epic-world-travel-time.md` for location infrastructure and NPC placement targets.

## Open Questions

- What triggers NPC migration between worlds?
- How does NPC memory persist across world resets?
- Can NPCs own and trade items independently?
