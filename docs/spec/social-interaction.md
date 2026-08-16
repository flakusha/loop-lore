<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Social Interaction Specification

**Status:** Final
**Authoritative source:** `src/` and `AGENTS.md`

---

## Overview

This document defines the social interaction system for loop-lore: persuasion, intimidation, deception, barter, leadership, and reputation.

Social interactions are resolved through a combination of LLM narration and deterministic mechanics (skill checks, stat modifiers).

---

## 1. Social Skills

### 1.1 Skill Definitions

| Skill        | Primary Stat | Description                    | Check Type              |
| ------------ | ------------ | ------------------------------ | ----------------------- |
| Persuasion   | CHA          | Convince through logic/emotion | d20 + CHA mod           |
| Intimidation | STR/CHA      | Threaten/coerce                | d20 + STR or CHA mod    |
| Deception    | CHA          | Lie/mislead                    | d20 + CHA mod           |
| Insight      | WIS          | Detect lies/read emotions      | d20 + WIS mod           |
| Performance  | CHA          | Entertain/impress              | d20 + CHA mod           |
| Barter       | CHA/INT      | Trade negotiation              | d20 + avg(CHA, INT) mod |
| Leadership   | CHA/WIS      | Command/inspire                | d20 + CHA mod           |
| Diplomacy    | CHA/INT      | Formal negotiations            | d20 + avg(CHA, INT) mod |

### 1.2 Skill Check Resolution

```typescript
interface SocialSkillCheck {
  skill: string;
  actor_id: string;
  target_id: string;
  dc: number; // difficulty class
  modifiers: SocialModifier[];
  roll: number; // d20 result
  total: number; // roll + modifiers
  success: boolean;
  margin: number; // total - DC (positive = success)
  critical: boolean; // natural 20
  fumble: boolean; // natural 1
}

interface SocialModifier {
  type: "relationship" | "reputation" | "mood" | "knowledge" | "circumstance" | "equipment" | "racial";
  value: number;
  source: string; // where the modifier comes from
  description: string;
}
```

---

## 2. Persuasion System

### 2.1 Persuasion Attempt

```typescript
interface PersuasionAttempt {
  persuader_id: string;
  target_id: string;
  argument: string;
  approach: PersuasionApproach;
  dc: number;
  modifiers: PersuasionModifier[];
  stakes: "low" | "medium" | "high" | "critical";
  result: PersuasionResult;
}

enum PersuasionApproach {
  Logical = "logical", // appeal to reason
  Emotional = "emotional", // appeal to feelings
  Flattery = "flattery", // compliment and praise
  Bribe = "bribe", // offer payment
  Threat = "threat", // intimidation
  Blackmail = "blackmail", // leverage secrets
  Evidence = "evidence", // present proof
}

interface PersuasionResult {
  success: boolean;
  confidence: number; // 0-100, how confident the target is
  npc_response: string; // LLM-generated response
  relationship_change: number; // standing change
  reputation_change: number; // reputation change
  follow_through_chance: number; // 0-100, will NPC actually comply?
}
```

### 2.2 Persuasion DC Modifiers

| Approach  | DC Modifier | Risk     |
| --------- | ----------- | -------- |
| Logical   | -5          | Low      |
| Emotional | -3          | Medium   |
| Flattery  | -2          | Low      |
| Bribe     | -10         | Medium   |
| Threat    | -8          | High     |
| Blackmail | -15         | Critical |
| Evidence  | -12         | Low      |

---

## 3. Intimidation System

### 3.1 Intimidation Mechanics

```typescript
interface IntimidationAttempt {
  intimidator_id: string;
  target_id: string;
  method: "verbal" | "physical" | "display" | "threat";
  dc: number;
  power_difference: number; // level/stats difference
  result: IntimidationResult;
}

interface IntimidationResult {
  success: boolean;
  compliance_level: "full" | "partial" | "temporary" | "none";
  fear_induced: number; // 0-100
  relationship_damage: number;
  retaliation_chance: number; // chance target retaliates later
}
```

### 3.2 Intimidation Factors

| Factor                | Effect     |
| --------------------- | ---------- |
| Size difference       | ±5-15      |
| Weapon display        | +5-10      |
| Reputation            | ±10-20     |
| Group advantage       | +5-15      |
| Target's courage      | -10-10     |
| Previous relationship | -20 to +20 |

---

## 4. Deception System

### 4.1 Deception Mechanics

```typescript
interface DeceptionAttempt {
  deceiver_id: string;
  target_id: string;
  lie: string;
  evidence: Evidence[];
  dc: number;
  result: DeceptionResult;
}

interface DeceptionResult {
  success: boolean;
  belief_level: "complete" | "partial" | "suspicious" | "disbelief";
  suspicion_gained: number; // 0-100, target's suspicion
  insight_check: InsightCheck | null; // if target suspects, they can check
}
```

### 4.2 Lie Detection (Insight Check)

When a target suspects deception, they can make an Insight check:

```typescript
interface InsightCheck {
  detector_id: string;
  target_id: string;
  statement: string;
  dc: number; // DC = deceiver's deception roll + 10
  tells: Tell[];
  result: InsightResult;
}

interface Tell {
  type: "body_language" | "voice" | "inconsistency" | "micro_expression";
  detectability: number; // 0-100
  reliability: number; // 0-100
}

interface InsightResult {
  detected: boolean;
  confidence: number; // 0-100, how confident the detector is
  specific_doubts: string[];
}
```

---

## 5. Barter System

### 5.1 Trading Mechanics

```typescript
interface BarterAttempt {
  seller_id: string;
  buyer_id: string;
  items: BarterItem[];
  asked_price: number;
  offered_price: number;
  dc: number;
  modifiers: BarterModifier[];
  result: BarterResult;
}

interface BarterItem {
  item_id: string;
  quantity: number;
  base_value: number;
  perceived_value: number; // influenced by skills
}

interface BarterResult {
  success: boolean;
  final_price: number;
  profit: number;
  relationship_change: number;
  future_discount: number; // percentage discount for future trades
}
```

### 5.2 Price Factors

| Factor        | Price Effect | Range |
| ------------- | ------------ | ----- |
| High supply   | -10 to -30%  | —     |
| Low supply    | +10 to +50%  | —     |
| Urgency       | +20 to +100% | —     |
| Relationship  | -10 to -20%  | —     |
| Reputation    | -5 to -15%   | —     |
| Barter skill  | -5 to -25%   | —     |
| Bulk purchase | -5 to -15%   | —     |

---

## 6. Reputation System

### 6.1 Reputation Structure

```typescript
interface SocialReputation {
  character_id: string;
  global_fame: number; // -1000 to 1000
  faction_reputation: FactionReputation[];
  titles: string[];
  public_opinion: PublicOpinion;
}

interface FactionReputation {
  faction_id: string;
  standing: number; // -1000 to 1000
  rank: string; // 'hated', 'unfriendly', 'neutral', 'friendly', 'exalted'
  titles: string[];
  benefits: string[];
}

interface PublicOpinion {
  trustworthiness: number; // -100 to 100
  generosity: number; // -100 to 100
  cruelty: number; // -100 to 100
  competence: number; // -100 to 100
  charisma: number; // -100 to 100
}
```

### 6.2 Reputation Tiers

| Standing      | Title      | Effects                         |
| ------------- | ---------- | ------------------------------- |
| -1000 to -500 | Hated      | Attack on sight, no services    |
| -499 to -100  | Unfriendly | Higher prices, limited services |
| -99 to 99     | Neutral    | Standard prices/services        |
| 100 to 499    | Friendly   | Discounts, special services     |
| 500 to 1000   | Exalted    | Best prices, unique rewards     |

---

## 7. Prompt Injection

Social state is injected into LLM prompts:

```
[Social Context — {actor_name}]
Standing with {target_name}: {standing_label} ({standing} points)
Reputation: {reputation_tier}
Mood: {mood_label} (happiness: {happiness})
Relationship: {relationship_type} (strength: {strength})
Recent Interactions: {recent_memories}
```

---

## 8. Database Schema

### New Tables

```sql
CREATE TABLE social_skill_checks (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES actors(id),
  target_id TEXT NOT NULL REFERENCES actors(id),
  skill TEXT NOT NULL,
  dc INTEGER NOT NULL,
  roll INTEGER NOT NULL,
  total INTEGER NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  modifiers JSON NOT NULL DEFAULT '[]',
  result JSON NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE social_reputation (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES actors(id),
  global_fame INTEGER NOT NULL DEFAULT 0,
  public_opinion JSON NOT NULL DEFAULT '{}',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE faction_standing (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES actors(id),
  faction_id TEXT NOT NULL,
  standing INTEGER NOT NULL DEFAULT 0,
  rank TEXT NOT NULL DEFAULT 'neutral',
  history JSON NOT NULL DEFAULT '[]',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. Implementation Notes

### Files to Create

| File                         | Purpose                 |
| ---------------------------- | ----------------------- |
| `src/social/types.ts`        | Social type definitions |
| `src/social/skill-check.ts`  | Skill check resolution  |
| `src/social/persuasion.ts`   | Persuasion mechanics    |
| `src/social/intimidation.ts` | Intimidation mechanics  |
| `src/social/deception.ts`    | Deception mechanics     |
| `src/social/barter.ts`       | Barter system           |
| `src/social/reputation.ts`   | Reputation system       |
| `src/db/schema-social.ts`    | Social schema types     |
| `src/routes/social.ts`       | Social API routes       |

### Files to Modify

| File                               | Purpose                      |
| ---------------------------------- | ---------------------------- |
| `src/routes/actors.ts`             | Add social endpoints         |
| `src/generation/actor-resolver.ts` | Add social context injection |

---

## Reference

| Document                                    | Covers                            |
| ------------------------------------------- | --------------------------------- |
| `docs/spec/rpg-mechanics.md`                | RPG mechanics, skill checks, dice |
| `docs/spec/actors.md`                       | Actor data model, relationships   |
| `docs/spec/items.md`                        | Item values, trade validation     |
| `.plan/epics/epic-social-interaction.md`    | Social interaction epic           |
| `.plan/tickets/TASK-social-interaction.md`  | Social interaction ticket         |
| `.plan/tickets/TASK-social-guild-system.md` | Guild system ticket               |
| `.plan/tickets/TASK-faction-reputation.md`  | Faction reputation ticket         |
