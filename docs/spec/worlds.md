# Worlds Specification

**Status:** Draft
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

This document defines the world system for loop-lore: how worlds are structured, how conditions work, how time progresses, and how worlds interact with characters and locations.

---

## 1. World Data Model

### 1.1 World Structure

```typescript
interface World {
  id: string;
  name: string;
  description: string;
  style: WorldStyle;
  conditions: WorldConditions;
  lore: WorldLore;
  locations: string[]; // location IDs
  npcs: string[]; // NPC actor IDs
  resources: string[]; // resource IDs
  anomalies: string[]; // anomaly IDs
  time_tracking: WorldTimeTracking;
  travel_system: WorldTravelSystem;
  rules: WorldRules;
  economy: WorldEconomy;
  visibility: WorldVisibility;
  created_by: string; // actor_id of creator
  created_at: Date;
  updated_at: Date;
}

enum WorldStyle {
  Fantasy = "fantasy",
  Realistic = "realistic",
  Cyberpunk = "cyberpunk",
  SciFi = "scifi",
  PostApocalyptic = "postapocalyptic",
  Historical = "historical",
  Horror = "horror",
  Steampunk = "steampunk",
  Custom = "custom",
}

interface WorldStyleConfig {
  type: WorldStyle;
  substyle?: string; // e.g., "high_fantasy", "dark_fantasy", "urban_fantasy"
  asset_set: string; // visual asset set reference
  npc_behavior_set: string; // NPC behavior preset
  item_property_set: string; // item property preset
  music_theme: string | null; // background music reference
  ambient_set: string; // ambient sound reference
}
```

### 1.2 World Conditions

```typescript
interface WorldConditions {
  weather: WeatherState;
  time_of_day: TimeOfDay;
  season: Season;
  year: number;
  global_modifiers: WorldModifier[];
  history: WorldEvent[];
  difficulty: DifficultyPreset;
}

interface WeatherState {
  current: WeatherType;
  intensity: number; // 0-100
  forecast: WeatherForecast[]; // upcoming weather changes
  transition_timer: number; // seconds until next weather change
}

enum WeatherType {
  Clear = "clear",
  Cloudy = "cloudy",
  Rain = "rain",
  Storm = "storm",
  Snow = "snow",
  Fog = "fog",
  Wind = "wind",
  Hot = "hot",
  Cold = "cold",
  Blizzard = "blizzard",
  AcidRain = "acid_rain",
  MagicStorm = "magic_storm",
  Eclipse = "eclipse",
  Aurora = "aurora",
}

interface TimeOfDay {
  current: "dawn" | "day" | "dusk" | "night";
  hour: number; // 0-23
  minute: number; // 0-59
  transition_timer: number; // seconds until next time period
}

enum Season {
  Spring = "spring",
  Summer = "summer",
  Autumn = "autumn",
  Winter = "winter",
}

interface WorldModifier {
  id: string;
  name: string;
  type: "environmental" | "magical" | "political" | "economic" | "social";
  description: string;
  intensity: number; // 0-100
  active: boolean;
  duration: number | null; // seconds, null = permanent
  effects: ModifierEffect[];
}
```

### 1.3 World Time Tracking

```typescript
interface WorldTimeTracking {
  mode: TimeTrackingMode;
  current_time: WorldTime;
  time_scale: number; // 1 real second = X world minutes
  quest_time_tracking: QuestTimeTracking;
  message_time_tracking: MessageTimeTracking;
  global_objectives: GlobalObjective[];
}

enum TimeTrackingMode {
  QuestExecution = "quest_execution",
  MessageCount = "message_count",
  TransfersOnly = "transfers_only",
  RealTime = "real_time",
}

interface WorldTime {
  day: number;
  hour: number;
  minute: number;
  season: Season;
  year: number;
}

interface QuestTimeTracking {
  main_quest_time: number; // total time spent on main quests
  side_quest_time: number; // total time spent on side quests
  active_quest_time: number; // time on current quest
  quest_time_limits: Record<string, number>; // quest ID → time limit
}

interface MessageTimeTracking {
  messages_per_time_unit: number; // messages = time progression
  transfer_time_only: boolean; // only count transfers for time
  time_attack_mode: boolean; // time attack mode enabled
  message_threshold: number; // messages before time advances
}

interface GlobalObjective {
  id: string;
  name: string;
  description: string;
  time_limit?: number; // world time seconds
  progress: number; // 0-100
  completed: boolean;
  consequences: ObjectiveConsequence[];
}
```

---

## 2. World Rules

### 2.1 Rule System

```typescript
interface WorldRules {
  p2p_trade: boolean;
  barter: boolean;
  require_proximity: boolean;
  trade_tax: number; // percentage
  max_trade_value: number; // 0 = unlimited
  cooldown_turns: number;
  escrow_enabled: boolean;
  auction_enabled: boolean;
  death_penalty: DeathPenalty;
  xp_rate: number;
  loot_rate: number;
  rest_rate: number;
  travel_rules: TravelRules;
  chat_rules: ChatRule[];
}

interface DeathPenalty {
  mode: "none" | "lose_items" | "lose_xp" | "respawn" | "permadeath";
  item_loss_percentage: number; // 0-100
  xp_loss_percentage: number; // 0-100
  respawn_location: "last_town" | "world_start" | "death_location";
  respawn_timer: number; // seconds
}

interface TravelRules {
  fast_travel_enabled: boolean;
  fast_travel_cost: number; // gold per use
  fast_travel_cooldown: number; // seconds
  travel_hazards_enabled: boolean;
  travel_resource_consumption: boolean;
}
```

### 2.2 Chat Rules (Scoped)

```typescript
interface ChatRule {
  id: string;
  world_id: string;
  scope: RuleScope; // 'world', 'location', 'chat'
  scope_id: string; // world_id, location_id, or chat_id
  name: string;
  description: string;
  rules: ChatRuleEntry[];
  priority: number; // higher = applied first
  active: boolean;
}

interface ChatRuleEntry {
  type: "mechanic_disable" | "mechanic_enable" | "modifier" | "restriction" | "bonus";
  mechanic: string; // mechanic name
  value: number | string;
  description: string;
}
```

---

## 3. World Economy

### 3.1 Economy Config

```typescript
interface WorldEconomy {
  currency: CurrencyConfig;
  price_index: number; // 1.0 = normal, >1 = inflation, <1 = deflation
  baseline_gold_supply: number;
  market_dynamics: MarketDynamics;
  tax_system: TaxSystem;
  active_events: WorldEvent[];
}

interface CurrencyConfig {
  primary: string; // e.g., "gold"
  denominations: CurrencyDenomination[];
  exchange_rates: Record<string, number>; // to primary currency
}

interface CurrencyDenomination {
  name: string;
  plural: string;
  value: number; // in smallest unit
  icon: string;
}

interface MarketDynamics {
  supply_factor: number; // 0.5-2.0
  demand_factor: number; // 0.5-2.0
  volatility: number; // 0-1, how much prices fluctuate
  price_floor: number; // minimum price multiplier
  price_ceiling: number; // maximum price multiplier
}

interface TaxSystem {
  sales_tax: number; // percentage
  income_tax: number; // percentage
  property_tax: number; // percentage
  travel_tax: number; // percentage
  quest_tax: number; // percentage (GM's cut)
}
```

---

## 4. World Visibility

### 4.1 World Access

```typescript
interface WorldVisibility {
  access: WorldAccess;
  discovery: WorldDiscovery;
  sharing: WorldSharing;
}

enum WorldAccess {
  Public = "public", // anyone can discover and enter
  Private = "private", // only invited users
  InviteOnly = "invite_only", // must be invited
  GMOnly = "gm_only", // only GMs can access
}

interface WorldDiscovery {
  method: "auto" | "quest" | "trade" | "map" | "rumor" | "none";
  discovery_dc: number; // 0 = auto-discovered
  discovery_requirements: string[]; // item IDs, quest IDs, etc.
}

interface WorldSharing {
  shareable: boolean;
  share_with: string[]; // actor IDs or faction IDs
  export_allowed: boolean;
  import_allowed: boolean;
  link_sharing: boolean; // can share via link?
}
```

---

## 5. World Lore

### 5.1 World Lore Structure

```typescript
interface WorldLore {
  world_id: string;
  entries: WorldLoreEntry[];
  scan_depth: number; // how many messages to scan for keyword triggers
  token_budget: number; // max tokens lore entries can consume in a prompt
}

interface WorldLoreEntry {
  id: string;
  world_id: string;
  name: string;
  content: string; // markdown
  category:
    | "history"
    | "geography"
    | "culture"
    | "religion"
    | "magic"
    | "politics"
    | "economy"
    | "creatures"
    | "custom";
  keys: string[]; // trigger keywords
  secondary_keys: string[]; // secondary trigger keywords
  position: "before_char" | "after_char"; // insertion position in prompt
  insertion_order: number;
  priority: number; // higher = injected first
  enabled: boolean;
  constant: boolean; // always included regardless of budget
}
```

---

## 6. Database Schema

### worlds table (existing, extended)

```sql
-- Existing columns in worlds table:
-- id, name, description, created_at, updated_at

-- Add these columns:
ALTER TABLE worlds ADD COLUMN style TEXT NOT NULL DEFAULT 'fantasy';
ALTER TABLE worlds ADD COLUMN conditions JSON NOT NULL DEFAULT '{}';
ALTER TABLE worlds ADD COLUMN time_tracking JSON NOT NULL DEFAULT '{}';
ALTER TABLE worlds ADD COLUMN rules JSON NOT NULL DEFAULT '{}';
ALTER TABLE worlds ADD COLUMN economy JSON NOT NULL DEFAULT '{}';
ALTER TABLE worlds ADD COLUMN visibility JSON NOT NULL DEFAULT '{}';
ALTER TABLE worlds ADD COLUMN lore_config JSON NOT NULL DEFAULT '{}';
ALTER TABLE worlds ADD COLUMN difficulty_modifier REAL NOT NULL DEFAULT 1.0;
ALTER TABLE worlds ADD COLUMN difficulty_reroll TEXT NOT NULL DEFAULT 'off';
ALTER TABLE worlds ADD COLUMN difficulty_state TEXT NOT NULL DEFAULT 'alive';
ALTER TABLE worlds ADD COLUMN scan_depth INTEGER NOT NULL DEFAULT 100;
ALTER TABLE worlds ADD COLUMN token_budget INTEGER NOT NULL DEFAULT 2000;
```

### New Tables

```sql
CREATE TABLE world_lore_entries (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'history',
  keys JSON NOT NULL DEFAULT '[]',
  secondary_keys JSON NOT NULL DEFAULT '[]',
  position TEXT NOT NULL DEFAULT 'before_char',
  insertion_order INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  constant INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_world_lore_world ON world_lore_entries(world_id);
```

---

## 7. Implementation Notes

### Files to Create

| File                      | Purpose                        |
| ------------------------- | ------------------------------ |
| `src/world/types.ts`      | World type definitions         |
| `src/world/manager.ts`    | World CRUD and management      |
| `src/world/time.ts`       | Time tracking system           |
| `src/world/conditions.ts` | World conditions and modifiers |
| `src/world/economy.ts`    | World economy system           |
| `src/world/rules.ts`      | World rules engine             |
| `src/world/lore.ts`       | World lore management          |
| `src/db/schema-world.ts`  | World schema types             |
| `src/routes/world.ts`     | World API routes               |

### Files to Modify

| File                               | Purpose                      |
| ---------------------------------- | ---------------------------- |
| `src/db/schema-core.ts`            | Add world columns            |
| `src/routes/world.ts`              | Add world endpoints          |
| `src/chat/service.ts`              | Add world context to chats   |
| `src/generation/actor-resolver.ts` | Add world context to prompts |

---

## Reference

| Document                                       | Covers                        |
| ---------------------------------------------- | ----------------------------- |
| `docs/spec/locations.md`                       | Location data model           |
| `docs/spec/npcs.md`                            | NPCs placed in locations      |
| `docs/spec/items.md`                           | World items and resources     |
| `.plan/epics/epic-world-locations.md`          | World/location epic           |
| `.plan/tickets/TASK-world-locations.md`        | World locations ticket        |
| `.plan/tickets/TASK-world-event-system.md`     | World event system ticket     |
| `.plan/tickets/TASK-world-state-management.md` | World state management ticket |
