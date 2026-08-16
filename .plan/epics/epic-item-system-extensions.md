<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Item System Extensions

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Issue:** `7cbf607`
**Type:** Feature Epic
**Tags:** items, durability, effects, stats, unique-items, dupe-protection, balance

## Overview

Extended item system mechanics — durability degradation, stat effects, stats drift, unique item tracking, duplicate protection, and overpowered item management. Builds on core item system from RPG Mechanics epic.

## Core Features

### 1. Durability System

```typescript
interface DurabilitySystem {
  item_id: string;
  current_durability: number;
  max_durability: number;
  degradation_rate: number; // per use
  degradation_type: "per_use" | "per_hit" | "per_spell" | "time_based";
  repair_cost: RepairCost;
  break_effects: BreakEffect[];
  warning_thresholds: number[]; // [50%, 25%, 10%]
}

interface RepairCost {
  materials: RepairMaterial[];
  gold: number;
  skill_required: number;
  station_required: CraftingStation;
}

interface RepairMaterial {
  item_id: string;
  quantity: number;
  quality_requirement: number;
}
```

#### Durability States

| State        | Durability % | Effects                   |
| ------------ | ------------ | ------------------------- |
| **Pristine** | 100%         | +5% bonus stats           |
| **Good**     | 75-99%       | Full stats                |
| **Worn**     | 50-74%       | -5% stats                 |
| **Damaged**  | 25-49%       | -15% stats, warning       |
| **Critical** | 10-24%       | -30% stats, risk of break |
| **Broken**   | 0-9%         | No stats, unequippable    |

#### Degradation Triggers

| Action            | Degradation | Notes                          |
| ----------------- | ----------- | ------------------------------ |
| **Normal Attack** | 0.1-0.5     | Per hit                        |
| **Heavy Attack**  | 0.5-1.0     | Stronger hits                  |
| **Block/Parry**   | 0.2-0.8     | Defensive use                  |
| **Spell Cast**    | 0.1-0.3     | Magic items                    |
| **Environmental** | 0.01-0.1    | Per minute in harsh conditions |
| **Death**         | 5-15        | On character death             |
| **Failed Repair** | 1-5         | Failed repair attempts         |

### 2. Item Effects System

```typescript
interface ItemEffects {
  item_id: string;
  passive_effects: PassiveEffect[];
  active_effects: ActiveEffect[];
  conditional_effects: ConditionalEffect[];
  set_effects: SetEffect[];
  enchantments: EnchantmentEffect[];
}

interface PassiveEffect {
  id: string;
  type: "stat_boost" | "regen" | "resistance" | "aura" | "passive_ability";
  stat?: Stat;
  value: number;
  stackable: boolean;
  max_stacks: number;
}

interface ActiveEffect {
  id: string;
  name: string;
  type: "spell" | "ability" | "consumable" | "trigger";
  cooldown: number; // in seconds
  charges: number; // -1 = unlimited
  cost: EffectCost;
  effect: EffectResult;
}

interface ConditionalEffect {
  id: string;
  condition: EffectCondition;
  effect: PassiveEffect | ActiveEffect;
  description: string;
}

interface EffectCondition {
  type: "health_threshold" | "enemy_type" | "environment" | "time" | "combo" | "set_bonus";
  value: number | string;
  operator: "gt" | "lt" | "eq" | "gte" | "lte";
}
```

#### Effect Categories

| Category       | Examples                  | Stackable         |
| -------------- | ------------------------- | ----------------- |
| **Stat Boost** | +10 STR, +5% Crit         | Yes (diminishing) |
| **Regen**      | HP/MP/Stamina regen       | Yes               |
| **Resistance** | Fire/Cold/Poison resist   | Yes (cap 75%)     |
| **Aura**       | Party buffs, area effects | No                |
| **Proc**       | On-hit effects, triggers  | No                |
| **Set Bonus**  | Multi-piece bonuses       | No                |

### 3. Stats Drift System

```typescript
interface StatsDrift {
  item_id: string;
  base_stats: ItemStats;
  current_stats: ItemStats;
  drift_factors: DriftFactor[];
  stability: number; // 0-100
  resonance: number; // -100 to 100
  corruption: number; // 0-100
}

interface DriftFactor {
  type: "use" | "time" | "enchantment" | "corruption" | "attunement" | "environment";
  impact: number; // -100 to 100
  volatility: number; // 0-100
  direction: "positive" | "negative" | "random";
}

interface ItemStats {
  primary: StatMap;
  secondary: StatMap;
  derived: StatMap;
  hidden: StatMap;
}
```

#### Drift Mechanics

| Factor          | Effect                         | Reversibility |
| --------------- | ------------------------------ | ------------- |
| **Heavy Use**   | Stats shift toward use pattern | Partial       |
| **Neglect**     | Stats decay over time          | Full (repair) |
| **Enchantment** | Permanent stat changes         | None          |
| **Corruption**  | Negative stat drift            | Difficult     |
| **Attunement**  | Positive stat alignment        | Permanent     |
| **Environment** | Location-based shifts          | Temporary     |

#### Drift Outcomes

```typescript
interface DriftOutcome {
  type: "stat_increase" | "stat_decrease" | "stat_shift" | "awakening" | "corruption" | "purification";
  magnitude: number;
  affected_stats: Stat[];
  trigger: string;
  description: string;
}
```

### 4. Unique Item Tracking

```typescript
interface UniqueItem {
  item_id: string;
  unique_id: string; // UUID for this specific instance
  name: string;
  origin: ItemOrigin;
  history: ItemHistory[];
  owners: ItemOwner[];
  kills: number;
  achievements: ItemAchievement[];
  legends: ItemLegend[];
  soulbound: boolean;
  tradeable: boolean;
}

interface ItemOrigin {
  created_by: string;
  created_at: Date;
  location: WorldLocation;
  method: "crafted" | "looted" | "quest" | "event" | "divine";
  story: string;
}

interface ItemHistory {
  event: "created" | "found" | "traded" | "stolen" | "lost" | "enchanted" | "corrupted" | "purified";
  timestamp: Date;
  actor: string;
  location: WorldLocation;
  details: string;
}

interface ItemOwner {
  owner_id: string;
  acquired: Date;
  lost?: Date;
  method: "found" | "traded" | "stolen" | "inherited" | "quest";
}
```

#### Unique Item Features

| Feature                 | Description              |
| ----------------------- | ------------------------ |
| **Kill Counter**        | Tracks enemies killed    |
| **Achievement Unlocks** | Special milestones       |
| **Legend Building**     | Stories attached to item |
| **Soul Binding**        | Cannot be traded/dropped |
| **Legacy System**       | Pass to heirs            |
| **Museum Display**      | Show in housing          |

### 5. Duplicate Protection

```typescript
interface DupeProtection {
  item_id: string;
  protection_type: "unique" | "limited" | "account_bound" | "world_unique";
  max_instances: number;
  current_instances: number;
  owner_distribution: OwnerDistribution[];
  protection_rules: ProtectionRule[];
}

interface ProtectionRule {
  condition: "drop" | "craft" | "quest" | "trade" | "loot";
  action: "block" | "reroll" | "convert" | "notify";
  alternative: AlternativeReward;
}

interface AlternativeReward {
  type: "currency" | "materials" | "different_item" | "upgrade_token";
  value: number | string;
}
```

#### Protection Types

| Type              | Max Instances  | Behavior                 |
| ----------------- | -------------- | ------------------------ |
| **Unique**        | 1 per server   | Block additional drops   |
| **Limited**       | N per server   | Block after N instances  |
| **Account Bound** | 1 per account  | Convert duplicates       |
| **World Unique**  | 1 per world    | Reroll to different item |
| **Time Limited**  | 1 during event | Block during event       |

#### Duplicate Handling

```typescript
interface DuplicateHandling {
  source: "drop" | "craft" | "quest" | "trade";
  existing_item: Item;
  new_item: Item;
  protection_type: ProtectionType;
  action: DuplicateAction;
  compensation: Compensation;
}

type DuplicateAction = "block" | "reroll" | "convert" | "merge" | "upgrade";

interface Compensation {
  currency?: number;
  materials?: Item[];
  upgrade_token?: boolean;
  experience?: number;
}
```

### 6. Overpowered Item Management

```typescript
interface OPItemManagement {
  item_id: string;
  power_level: number; // 1-100
  balance_score: number; // 0-100
  restrictions: ItemRestriction[];
  scaling: PowerScaling;
  nerf_history: NerfRecord[];
  community_votes: BalanceVote[];
}

interface ItemRestriction {
  type: "level_requirement" | "quest_requirement" | "content_lock" | "usage_limit" | "pvp_disabled" | "pve_only";
  value: number | string;
  description: string;
}

interface PowerScaling {
  type: "linear" | "diminishing" | "threshold" | "level_based";
  curve: ScalingCurve;
  cap: number;
  floor: number;
}
```

#### OP Item Detection

```typescript
interface OPDetection {
  item_id: string;
  metrics: BalanceMetric[];
  thresholds: BalanceThreshold[];
  auto_detect: boolean;
  community_reports: number;
  win_rate_impact: number;
  usage_rate: number;
}

interface BalanceMetric {
  name: string;
  value: number;
  threshold: number;
  status: "normal" | "watchlist" | "overpowered" | "broken";
}
```

#### OP Item Actions

| Action        | Trigger               | Effect              |
| ------------- | --------------------- | ------------------- |
| **Monitor**   | Slight imbalance      | Track usage         |
| **Soft Nerf** | Moderate imbalance    | Reduce drop rate    |
| **Hard Nerf** | Significant imbalance | Reduce stats        |
| **Disable**   | Game-breaking         | Temporarily disable |
| **Rework**    | Fundamental issues    | Complete rework     |
| **Ban**       | Exploit-level         | Remove from game    |

#### Scaling Solutions

```typescript
interface ScalingSolution {
  type: "level_scaling" | "content_scaling" | "pvp_scaling" | "progression_scaling";
  implementation: ScalingImplementation;
  community_feedback: FeedbackRecord[];
  effectiveness: number; // 0-100
}

interface ScalingImplementation {
  method: "stat_reduction" | "level_sync" | "content_gating" | "usage_cooldown";
  parameters: Record<string, number>;
  exceptions: string[];
}
```

## Integration Points

- **RPG Mechanics** — Core item system, stats
- **Combat System** — Durability in combat, effects
- **Crafting System** — Repair, enchanting
- **Economy System** — Trading, value
- **Plugin System** — Extensible effects
- **Housing System** — Item display, storage

## Tasks

| Task                 | Priority | Effort | Status         |
| -------------------- | -------- | ------ | -------------- |
| Durability System    | High     | Medium | ⬜ Not Started |
| Item Effects System  | High     | High   | ⬜ Not Started |
| Stats Drift System   | Medium   | High   | ⬜ Not Started |
| Unique Item Tracking | Medium   | Medium | ⬜ Not Started |
| Duplicate Protection | High     | Medium | ⬜ Not Started |
| OP Item Management   | High     | High   | ⬜ Not Started |

## Open Questions

- Should durability be visible to players or hidden?
- How to balance stats drift without frustrating players?
- Should unique items be tradeable?
- How to handle OP items without breaking player investment?
- Should dupe protection apply to all items or just rare ones?

## Files

- `src/rpg/items/durability.ts` — Durability system
- `src/rpg/items/effects.ts` — Item effects
- `src/rpg/items/drift.ts` — Stats drift
- `src/rpg/items/unique.ts` — Unique item tracking
- `src/rpg/items/duplication.ts` — Duplicate protection
- `src/rpg/items/balance.ts` — OP item management
- `src/db/schema-items-extended.ts` — Extended item tables
- `src/routes/items-extended.ts` — Extended item API

## Related Epics

- **Epic RPG Mechanics** — Core item system
- **Epic Crafting & Professions** — Repair, enchanting
- **Epic Economy & Trading** — Item value, trading
- **Epic Battle & Action Systems** — Combat effects

## Linked Tasks

- TASK-item-system-extensions.md
