<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Locations Specification

**Status:** Draft
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

This document defines the location system for loop-lore: how locations are structured, how they connect, what anomalies they contain, and how they interact with characters and the world.

---

## 1. Location Data Model

### 1.1 Location Structure

```typescript
interface Location {
  id: string;
  world_id: string; // FK to worlds
  name: string;
  description: string;
  type: LocationType;
  style: LocationStyle;
  conditions: LocationConditions;
  anomalies: LocationAnomaly[];
  items: LocationItem[];
  resources: LocationResource[];
  npcs: LocationNPC[];
  storage: PersistentStorage | null;
  discovered: boolean;
  unique: boolean;
  travel_connections: TravelConnection[];
  time_events: TimeEvent[];
  parent_location_id: string | null; // for sub-locations
  children_location_ids: string[]; // for nested locations
}

enum LocationType {
  Dungeon = "dungeon",
  Town = "town",
  Wilderness = "wilderness",
  Indoor = "indoor",
  Outdoor = "outdoor",
  Underground = "underground",
  Aerial = "aerial",
  Aquatic = "aquatic",
  Special = "special", // unique/historic locations
  Temporary = "temporary", // time-limited locations
}

interface LocationStyle {
  biome: string; // "forest", "desert", "arctic", "urban", etc.
  theme: string; // "dark", "bright", "mysterious", "peaceful", etc.
  atmosphere: string; // "tense", "relaxed", "dangerous", "mysterious"
  asset_set: string; // visual asset set for rendering
  ambient_sounds: string[]; // sound asset references
  music_theme: string | null; // music asset reference
}

interface LocationConditions {
  danger_level: number; // 0-100
  exploration_progress: number; // 0-100, % explored
  resources_remaining: number; // 0-100, % of resources left
  npc_presence: number; // 0-100, how many NPCs are present
  anomaly_strength: number; // 0-100, power of anomalies here
  visibility: number; // 0-100, how visible/clear the location is
  accessibility: number; // 0-100, how easy to reach
  stability: number; // 0-100, is the location stable or changing?
}
```

### 1.2 Location Types Detail

| Type        | Description                          | Examples                      |
| ----------- | ------------------------------------ | ----------------------------- |
| Dungeon     | Enclosed, underground, combat-heavy  | Cave, ruins, crypt            |
| Town        | Civilized settlement, NPCs, shops    | Village, city, outpost        |
| Wilderness  | Open, natural, exploration-focused   | Forest, plains, mountains     |
| Indoor      | Interior space, puzzle/exploration   | Castle, tower, temple         |
| Outdoor     | Open air, travel-focused             | Field, beach, mountain peak   |
| Underground | Subterranean, resource-rich          | Mine, cavern, tunnel          |
| Aerial      | Above ground, travel-focused         | Floating island, mountaintop  |
| Aquatic     | Water-based, exploration-focused     | Lake, river, ocean floor      |
| Special     | Unique, hand-crafted, story-critical | Sacred grove, ancient ruin    |
| Temporary   | Time-limited, event-based            | Festival grounds, battlefield |

---

## 2. Travel Connections

### 2.1 Connection Definition

```typescript
interface TravelConnection {
  id: string;
  source_location_id: string;
  target_location_id: string;
  distance: number; // world units
  travel_modes: string[]; // travel mode IDs
  hazards: string[]; // hazard IDs
  discovered: boolean; // has this connection been found?
  locked: boolean; // is this connection locked?
  unlock_conditions: TravelCondition[];
  bidirectional: boolean; // can travel both ways?
}

interface TravelCondition {
  type: "quest" | "item" | "skill" | "time" | "weather" | "world_state";
  operator: "eq" | "gt" | "lt" | "gte" | "lte" | "has" | "not_has";
  value: number | string;
  description: string; // human-readable condition description
}
```

### 2.2 Travel Modes

```typescript
interface TravelMode {
  id: string;
  name: string;
  speed: number; // world units per hour
  requirements: TravelRequirement[];
  hazards: string[];
  resource_cost: TravelResourceCost;
  can_encounter: boolean; // can random encounters occur during this mode?
}

interface TravelRequirement {
  type: "skill" | "item" | "condition" | "level";
  skill?: string;
  item_id?: string;
  condition?: string;
  level?: number;
}

interface TravelResourceCost {
  food: number; // food units per distance
  water: number; // water units per distance
  stamina: number; // stamina cost
  gold: number; // gold cost (for fast travel)
}
```

---

## 3. Anomalies

### 3.1 Anomaly Definition

```typescript
interface LocationAnomaly {
  id: string;
  location_id: string;
  name: string;
  description: string;
  type: AnomalyType;
  effect: AnomalyEffect;
  duration: number; // seconds, -1 for permanent
  discovery_chance: number; // 0-1
  interaction_required: boolean;
  discovered: boolean;
  activated: boolean;
  cooldown: number; // seconds before anomaly can trigger again
}

enum AnomalyType {
  Positive = "positive",
  Negative = "negative",
  Neutral = "neutral",
  Mystery = "mystery", // requires investigation
  Treasure = "treasure", // contains valuable items
  Danger = "danger", // harmful effect
  Wonder = "wonder", // awe-inspiring, no mechanical effect
}

interface AnomalyEffect {
  stat_modifiers: Record<string, number>;
  damage_over_time?: number;
  healing_over_time?: number;
  experience_multiplier?: number;
  loot_multiplier?: number;
  special_effects: string[]; // narrative effects
  duration_modifier?: number; // modifies anomaly duration
  visibility_modifier?: number; // affects location visibility
}
```

### 3.2 Anomaly Examples

| Type     | Name              | Effect                           |
| -------- | ----------------- | -------------------------------- |
| Positive | Healing Spring    | Restores HP/MP over time         |
| Positive | Ancient Shrine    | +10% XP gain                     |
| Negative | Poisonous Fog     | DoT, -10% accuracy               |
| Negative | Unstable Ground   | Risk of falling damage           |
| Neutral  | Mysterious Statue | No immediate effect, lore entry  |
| Mystery  | Hidden Passage    | Reveals secret location          |
| Treasure | Buried Cache      | Contains loot                    |
| Danger   | Lava Vent         | Damage over area                 |
| Wonder   | Northern Lights   | No mechanical effect, atmosphere |

---

## 4. Location Items and Resources

### 4.1 Location Items

```typescript
interface LocationItem {
  id: string;
  location_id: string;
  item_definition_id: string; // references item_definitions
  quantity: number;
  discovered: boolean; // has the player found this?
  hidden: boolean; // requires search to find
  search_dc: number; // difficulty to find (0 = automatic)
  respawn_timer: number | null; // world time seconds until respawn (null = never)
  respawn_quantity: number; // quantity after respawn
}
```

### 4.2 Location Resources

```typescript
interface LocationResource {
  id: string;
  location_id: string;
  resource_id: string; // references resource_definitions
  quantity: number;
  quality: Rarity; // common, uncommon, rare, epic, legendary
  regeneration_rate: number; // per hour
  extraction_difficulty: number; // 0-100
  discovered: boolean;
  extraction_tool_required: string | null; // item definition ID
}
```

---

## 5. Persistent Storage

```typescript
interface PersistentStorage {
  id: string;
  location_id: string;
  capacity: number; // max items
  items: StoredItem[];
  security: number; // 0-100, theft protection
  access_control: AccessControl;
  owner_id: string | null; // null = public storage
}

interface StoredItem {
  item_instance_id: string;
  quantity: number;
  stored_at: Date;
  stored_by: string; // actor_id who stored it
}

interface AccessControl {
  mode: "public" | "owner_only" | "faction" | "password";
  allowed_actors: string[]; // actor IDs
  allowed_factions: string[];
  password: string | null;
}
```

---

## 6. Time Events

```typescript
interface TimeEvent {
  id: string;
  location_id: string;
  name: string;
  description: string;
  trigger: TimeTrigger;
  effect: TimeEffect;
  recurring: boolean;
  interval: number | null; // world time seconds (null = one-time)
  active: boolean;
  conditions: TimeEventCondition[];
}

interface TimeTrigger {
  type: "time" | "weather" | "season" | "player_action" | "world_event";
  value: string; // e.g., "night", "winter", "full_moon"
}

interface TimeEffect {
  type: "spawn" | "despawn" | "transform" | "state_change" | "message";
  target: string; // location_id, npc_id, or item_id
  data: Record<string, unknown>;
}
```

---

## 7. Database Schema

### locations table (new)

```sql
CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL, -- location type enum
  style JSON NOT NULL DEFAULT '{}',
  conditions JSON NOT NULL DEFAULT '{}',
  discovered INTEGER NOT NULL DEFAULT 0,
  unique INTEGER NOT NULL DEFAULT 0,
  parent_location_id TEXT REFERENCES locations(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_locations_world ON locations(world_id);
CREATE INDEX idx_locations_parent ON locations(parent_location_id);
```

### location_travel_connections table

```sql
CREATE TABLE location_travel_connections (
  id TEXT PRIMARY KEY,
  source_location_id TEXT NOT NULL REFERENCES locations(id),
  target_location_id TEXT NOT NULL REFERENCES locations(id),
  distance REAL NOT NULL DEFAULT 1.0,
  travel_modes JSON NOT NULL DEFAULT '[]',
  hazards JSON NOT NULL DEFAULT '[]',
  discovered INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  unlock_conditions JSON NOT NULL DEFAULT '[]',
  bidirectional INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_connections_source ON location_travel_connections(source_location_id);
CREATE INDEX idx_connections_target ON location_travel_connections(target_location_id);
```

### location_anomalies table

```sql
CREATE TABLE location_anomalies (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL, -- 'positive', 'negative', 'neutral', 'mystery', 'treasure', 'danger', 'wonder'
  effect JSON NOT NULL DEFAULT '{}',
  duration INTEGER NOT NULL DEFAULT -1,
  discovery_chance REAL NOT NULL DEFAULT 1.0,
  interaction_required INTEGER NOT NULL DEFAULT 0,
  discovered INTEGER NOT NULL DEFAULT 0,
  activated INTEGER NOT NULL DEFAULT 0,
  cooldown INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_anomalies_location ON location_anomalies(location_id);
```

### location_items table

```sql
CREATE TABLE location_items (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  item_definition_id TEXT NOT NULL REFERENCES item_definitions(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  discovered INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  search_dc INTEGER NOT NULL DEFAULT 0,
  respawn_timer INTEGER,
  respawn_quantity INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_location_items_location ON location_items(location_id);
```

---

## 8. Implementation Notes

### Files to Create

| File                         | Purpose                        |
| ---------------------------- | ------------------------------ |
| `src/locations/types.ts`     | Location type definitions      |
| `src/locations/manager.ts`   | Location CRUD and management   |
| `src/locations/travel.ts`    | Travel connection and movement |
| `src/locations/anomaly.ts`   | Anomaly system                 |
| `src/locations/resources.ts` | Resource extraction            |
| `src/locations/storage.ts`   | Persistent storage             |
| `src/db/schema-locations.ts` | Location schema types          |
| `src/routes/locations.ts`    | Location API routes            |

### Files to Modify

| File                           | Purpose                         |
| ------------------------------ | ------------------------------- |
| `src/db/schema-world.ts`       | Add location references         |
| `src/routes/world.ts`          | Add location endpoints          |
| `src/actors/actor-resolver.ts` | Add location context to prompts |

---

## Reference

| Document                                         | Covers                                        |
| ------------------------------------------------ | --------------------------------------------- |
| `docs/spec/worlds.md`                            | World data model (locations belong to worlds) |
| `docs/spec/npcs.md`                              | NPC placement at locations                    |
| `docs/spec/items.md`                             | Location items                                |
| `.plan/epics/epic-world-locations.md`            | World/location epic                           |
| `.plan/tickets/TASK-world-locations.md`          | World locations ticket                        |
| `.plan/tickets/TASK-random-encounters-events.md` | Random encounters at locations                |
