# NPC Specification

**Status:** Final
**Supersedes:** NPC sections in `docs/spec/actors.md` and `.plan/epics/epic-world-locations.md`
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

This document defines the NPC specification for loop-lore: how NPCs are modeled, how they behave, how they remember interactions, and how they interact with players and the world.

NPCs are a specialized type of actor (`actor_type='npc'`) with additional behavioral state, memory, and interaction capabilities beyond what the base `actors` table provides.

---

## 1. NPC Data Model

### 1.1 NPC Types

| Type             | Description                                     | Example                     |
| ---------------- | ----------------------------------------------- | --------------------------- |
| `merchant`       | Sells items, buys items, manages shop inventory | Blacksmith, apothecary      |
| `quest_giver`    | Offers quests, tracks completion                | Village elder, guild master |
| `guard`          | Enforces rules, patrols locations               | City watch, dungeon sentry  |
| `villager`       | Background NPC, provides lore, reacts to events | Farmer, baker, fisherman    |
| `monster`        | Hostile entity, combat encounter                | Goblin, dragon, undead      |
| `neutral`        | Neither friendly nor hostile, can be persuaded  | Wanderer, trader, hermit    |
| `faction_leader` | Leads a faction, controls diplomacy             | Guild master, king, warlord |
| `companion`      | Joins player's party, participates in combat    | Hireling, summoned creature |

### 1.2 NPC-Specific Fields

Beyond the base `actors` table, NPCs have these additional fields:

| Field                   | Type                | Default    | Description                        |
| ----------------------- | ------------------- | ---------- | ---------------------------------- |
| `npc_type`              | `NPCType` enum      | `villager` | NPC classification                 |
| `npc_behavior`          | `NPCBehavior` JSON  | `{}`       | Behavior configuration             |
| `npc_schedule`          | `NPCSchedule` JSON  | `{}`       | Daily schedule                     |
| `npc_inventory`         | `NPCInventory` JSON | `{}`       | Shop/trade inventory               |
| `npc_standing`          | JSON                | `{}`       | Faction standings and reputation   |
| `npc_memory`            | JSON                | `{}`       | NPC memory of player interactions  |
| `npc_emotional_state`   | JSON                | `{}`       | Current emotional state            |
| `npc_location_id`       | `TEXT \| null`      | `null`     | Current location (for mobile NPCs) |
| `npc_migration_pattern` | JSON                | `{}`       | Migration rules (for roaming NPCs) |

### 1.3 NPC Behavior State Machine

```typescript
interface NPCBehavior {
  type: NPCType;
  aggression: number; // 0-100
  helpfulness: number; // 0-100
  curiosity: number; // 0-100
  suspicion: number; // 0-100
  obedience: number; // 0-100 (for companion NPCs)

  // Behavior state machine
  state: NPCState;
  states: NPCStateConfig;
}

type NPCState =
  | "idle"
  | "patrol"
  | "interact"
  | "combat"
  | "flee"
  | "trade"
  | "quest"
  | "sleep"
  | "work";

interface NPCStateConfig {
  idle: {
    duration: number; // seconds
    transitions: Record<NPCState, number>; // target state → probability
  };
  patrol: {
    route: string[]; // location IDs
    speed: number;
    alertness: number; // chance to detect player
  };
  interact: {
    greeting: string;
    dialogue_options: DialogueOption[];
    follow_up: string | null;
  };
  combat: {
    tactics: CombatTactic[];
    retreat_threshold: number; // HP % to flee
    ally_call_chance: number; // call for help
  };
  flee: {
    speed_multiplier: number;
    flee_distance: number; // world units
    hide_behavior: "run" | "hide" | "fight_back";
  };
  trade: {
    inventory: TradeInventory;
    price_modifier: number;
    haggling: boolean;
  };
  quest: {
    active_quests: string[];
    quest_giver: boolean;
    reward_type: "gold" | "item" | "reputation" | "information";
  };
  sleep: {
    hours: [number, number,]; // start_hour, end_hour
    location: string; // location_id where NPC sleeps
    wake_trigger: string[]; // events that wake NPC
  };
  work: {
    task: string;
    location: string;
    duration: number; // hours
    progress: number; // 0-100
  };
}
```

---

## 2. NPC Memory System

### 2.1 Memory Structure

NPCs maintain a memory of player interactions that affects their behavior and dialogue.

```typescript
interface NPCMemory {
  npc_id: string;
  player_id: string;
  world_id: string;

  memories: NPCMemoryEntry[];
  emotional_state: EmotionalState;
  relationships: NPCRelationship[];
  grudges: Grudge[];
  friendships: Friendship[];
  memory_decay: MemoryDecayConfig;
}

interface NPCMemoryEntry {
  id: string;
  type: "interaction" | "event" | "observation" | "rumor" | "insult" | "favor";
  content: string;
  timestamp: Date;
  importance: number; // 0-100
  emotional_impact: number; // -100 to 100
  player_action: string; // What the player did
  npc_reaction: string; // How the NPC reacted
  decay_rate: number; // How fast this memory fades
  shared: boolean; // Shared with other NPCs?
  context: {
    location_id: string;
    chat_id: string;
    world_state: Record<string, unknown>;
  };
}

interface EmotionalState {
  happiness: number; // -100 to 100
  anger: number; // -100 to 100
  fear: number; // -100 to 100
  sadness: number; // -100 to 100
  surprise: number; // -100 to 100
  disgust: number; // -100 to 100
  trust: number; // -100 to 100 (toward specific player)
  dominant: string; // Dominant emotion
}
```

### 2.2 Memory Decay

| Factor                  | Decay Rate            | Notes                           |
| ----------------------- | --------------------- | ------------------------------- |
| Base decay              | 0.1/day               | All memories decay at this rate |
| Importance multiplier   | ×(1 + importance/100) | Important memories decay slower |
| Emotional multiplier    | ×(1 +                 | emotional_impact                |
| Shared memory bonus     | ×0.5                  | Shared memories decay slower    |
| Reinforcement threshold | 50                    | Memories above this don't decay |

### 2.3 Memory Sharing Between NPCs

NPCs can share memories with other NPCs in the same location or faction:

```typescript
interface MemorySharing {
  source_npc_id: string;
  target_npc_ids: string[];
  sharing_type: "direct" | "rumor" | "faction_channel";
  fidelity: number; // 0-1, how accurately the memory is transmitted
  delay: number; // world time seconds before sharing
  distortion: number; // 0-1, how much the memory is distorted in transmission
}
```

---

## 3. NPC Dialogue System

### 3.1 Dialogue Flow

```typescript
interface NPCDialogue {
  npc_id: string;
  player_id: string;
  world_id: string;

  current_node: string;
  nodes: DialogueNode[];
  history: DialogueHistory[];
  state: DialogueState;
}

interface DialogueNode {
  id: string;
  speaker: string; // NPC ID
  text: string; // Can contain template variables
  options: DialogueOption[];
  conditions: DialogueCondition[];
  effects: DialogueEffect[];
}

interface DialogueOption {
  id: string;
  text: string; // What the player sees
  skill_check?: SocialSkillCheck;
  conditions: DialogueCondition[];
  consequences: DialogueConsequence[];
  next_node: string;
}

interface DialogueCondition {
  type: "standing" | "quest" | "memory" | "time" | "location" | "item" | "global";
  operator: "eq" | "gt" | "lt" | "gte" | "lte" | "has" | "not_has";
  value: number | string | string[];
}

interface DialogueEffect {
  type:
    | "standing_change"
    | "memory_add"
    | "quest_update"
    | "item_give"
    | "item_take"
    | "state_change"
    | "location_change";
  target: string;
  value: number;
  description: string;
}
```

### 3.2 Dialogue Modifiers

NPC dialogue is modified by:

| Modifier              | Source                | Effect                          |
| --------------------- | --------------------- | ------------------------------- |
| Relationship standing | `actor_relationships` | Changes tone, available options |
| Mood                  | `character_mood`      | Changes emotional expression    |
| Location              | Current location      | Changes available topics        |
| Time of day           | World time            | Changes greetings, availability |
| Player reputation     | `social_reputation`   | Changes NPC attitude            |
| Recent interactions   | `NPCMemory`           | References past events          |
| Faction standing      | `npc_standing`        | Opens/closes dialogue options   |

---

## 4. NPC Inventory & Trading

### 4.1 NPC Shop Inventory

```typescript
interface NPCShopInventory {
  npc_id: string;
  location_id: string;

  items: ShopItem[];
  currency_accepted: string[]; // currencies the NPC accepts
  price_modifier: number; // 1.0 = base, 0.8 = 20% discount, 1.5 = 50% markup
  restock_schedule: RestockSchedule;
  restock_timer: number; // world time seconds until next restock
  max_inventory: number; // max items in shop

  // Dynamic inventory (changes based on world state)
  dynamic_items: DynamicShopItem[];
}

interface ShopItem {
  item_id: string;
  quantity: number;
  price: number; // base price
  markup: number; // NPC-specific markup
  available: boolean; // can this item be purchased?
  restock_after?: number; // world time seconds until restock (if quantity = 0)
}

interface DynamicShopItem {
  item_id: string;
  condition: string; // world state condition for availability
  price_multiplier: number; // modifier to base price
  quantity_range: [number, number,]; // min/max available
}
```

### 4.2 Trading Interface

NPC trading follows the same pattern as player trading (see `docs/spec/rpg-mechanics.md` Trading section):

1. Player initiates trade dialogue
2. LLM narrates the interaction
3. Player selects items/currency to trade
4. Engine validates (sufficient funds, item availability)
5. Engine executes atomic transfer
6. LLM narrates the completed transaction
7. NPC reputation updated

---

## 5. NPC Placement & Migration

### 5.1 Placement Rules

NPCs are placed at locations within worlds:

```typescript
interface NPCPlacement {
  npc_id: string;
  location_id: string;
  world_id: string;

  spawn_type: "fixed" | "random" | "quest_triggered" | "time_based" | "event_triggered";
  spawn_conditions: SpawnCondition[];
  despawn_conditions: DespawnCondition[];
  respawn_timer?: number; // world time seconds (for random spawns)
  priority: number; // Higher = more likely to spawn
}

interface SpawnCondition {
  type: "time" | "weather" | "season" | "player_count" | "quest_state" | "world_state";
  operator: "eq" | "gt" | "lt" | "gte" | "lte" | "contains" | "not_contains";
  value: number | string | string[];
}
```

### 5.2 Migration

NPCs can move between locations:

```typescript
interface NPCMigration {
  npc_id: string;
  can_migrate: boolean;

  // Preferred locations (in order of preference)
  preferred_locations: string[];

  // Triggers for migration
  triggers: MigrationTrigger[];

  // Migration chance (0-1)
  migration_chance: number;

  // Migration speed (world units per hour)
  speed: number;

  // Route (if fixed path)
  route?: string[]; // location IDs
}

interface MigrationTrigger {
  type: "time" | "event" | "player_action" | "world_state" | "health";
  condition: string;
  target_location: string;
}
```

---

## 6. Prompt Injection

NPCs are injected into LLM prompts similarly to characters:

```
[NPC — {npc_name}]
Type: {npc_type}
Disposition: {aggression} aggression, {helpfulness} helpfulness
Current mood: {emotional_state.dominant} (happiness: {happiness})
Relationship with player: {standing_label} (standing: {standing})
Recent interactions: {recent_memories}
Current location: {location_name}
Available actions: {available_dialogue_options}
```

---

## 7. Database Schema

### New Tables

```sql
-- NPC behavior config
CREATE TABLE npc_behaviors (
  id TEXT PRIMARY KEY,
  npc_id TEXT NOT NULL REFERENCES actors(id),
  behavior JSON NOT NULL DEFAULT '{}',
  schedule JSON NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- NPC memory
CREATE TABLE npc_memories (
  id TEXT PRIMARY KEY,
  npc_id TEXT NOT NULL REFERENCES actors(id),
  player_id TEXT NOT NULL REFERENCES actors(id),
  world_id TEXT NOT NULL REFERENCES worlds(id),
  type TEXT NOT NULL, -- 'interaction', 'event', 'observation', 'rumor', 'insult', 'favor'
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 50,
  emotional_impact INTEGER NOT NULL DEFAULT 0,
  decay_rate REAL NOT NULL DEFAULT 0.1,
  shared INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- NPC emotional state
CREATE TABLE npc_emotional_states (
  id TEXT PRIMARY KEY,
  npc_id TEXT NOT NULL REFERENCES actors(id),
  happiness REAL NOT NULL DEFAULT 50,
  anger REAL NOT NULL DEFAULT 0,
  fear REAL NOT NULL DEFAULT 0,
  sadness REAL NOT NULL DEFAULT 0,
  trust REAL NOT NULL DEFAULT 50,
  dominant TEXT NOT NULL DEFAULT 'neutral',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- NPC shop inventory
CREATE TABLE npc_shop_inventory (
  id TEXT PRIMARY KEY,
  npc_id TEXT NOT NULL REFERENCES actors(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  item_id TEXT NOT NULL REFERENCES world_items(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL DEFAULT 0,
  markup REAL NOT NULL DEFAULT 1.0,
  restock_after INTEGER, -- world time seconds
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- NPC placement
CREATE TABLE npc_placements (
  id TEXT PRIMARY KEY,
  npc_id TEXT NOT NULL REFERENCES actors(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  world_id TEXT NOT NULL REFERENCES worlds(id),
  spawn_type TEXT NOT NULL DEFAULT 'fixed',
  spawn_conditions JSON NOT NULL DEFAULT '[]',
  despawn_conditions JSON NOT NULL DEFAULT '[]',
  respawn_timer INTEGER,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- NPC migration
CREATE TABLE npc_migrations (
  id TEXT PRIMARY KEY,
  npc_id TEXT NOT NULL REFERENCES actors(id),
  can_migrate INTEGER NOT NULL DEFAULT 0,
  preferred_locations JSON NOT NULL DEFAULT '[]',
  triggers JSON NOT NULL DEFAULT '[]',
  migration_chance REAL NOT NULL DEFAULT 0.0,
  speed REAL NOT NULL DEFAULT 1.0,
  route JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 8. Implementation Notes

### Files to Create

| File                    | Purpose                             |
| ----------------------- | ----------------------------------- |
| `src/npcs/types.ts`     | NPC type definitions and interfaces |
| `src/npcs/behavior.ts`  | NPC behavior state machine          |
| `src/npcs/memory.ts`    | NPC memory system                   |
| `src/npcs/dialogue.ts`  | NPC dialogue flow and conditions    |
| `src/npcs/shop.ts`      | NPC shop inventory and trading      |
| `src/npcs/placement.ts` | NPC placement and migration         |
| `src/npcs/prompt.ts`    | NPC prompt injection                |
| `src/db/schema-npcs.ts` | NPC-specific schema types           |
| `src/routes/npcs.ts`    | NPC API routes                      |

### Files to Modify

| File                               | Purpose                  |
| ---------------------------------- | ------------------------ |
| `src/db/schema-actors.ts`          | Add NPC-specific columns |
| `src/db/schema-story.ts`           | Add NPC tables           |
| `src/routes/actors.ts`             | Add NPC endpoints        |
| `src/generation/actor-resolver.ts` | Add NPC prompt injection |

---

## Reference

| Document                                 | Covers                                             |
| ---------------------------------------- | -------------------------------------------------- |
| `docs/spec/actors.md`                    | Base actor data model                              |
| `docs/spec/characters.md`                | Character system (NPCs are a type of actor)        |
| `docs/spec/worlds.md`                    | World data model (NPCs live in worlds)             |
| `docs/spec/locations.md`                 | Location data model (NPCs are placed at locations) |
| `docs/spec/social-interaction.md`        | Social mechanics (NPCs use social skills)          |
| `.plan/epics/epic-world-locations.md`    | World/location epic (NPC placement is a sub-topic) |
| `.plan/epics/epic-social-interaction.md` | Social interaction epic (NPC social mechanics)     |
