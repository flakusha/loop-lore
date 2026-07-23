# EPIC: Social Interaction Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Issue:** `697652f`
**Type:** Feature Epic
**Tags:** social, persuasion, intimidation, deception, barter, leadership, reputation

## Overview

Social interaction mechanics — persuasion, intimidation, deception, barter, leadership, and reputation. Supports both player-NPC and player-player social interactions.

## Social Skills

### Core Social Skills

| Skill            | Primary Stat | Description                    |
| ---------------- | ------------ | ------------------------------ |
| **Persuasion**   | CHA          | Convince through logic/emotion |
| **Intimidation** | STR/CHA      | Threaten/coerce                |
| **Deception**    | CHA          | Lie/mislead                    |
| **Insight**      | WIS          | Detect lies/read emotions      |
| **Performance**  | CHA          | Entertain/impress              |
| **Barter**       | CHA/INT      | Trade negotiation              |
| **Leadership**   | CHA/WIS      | Command/inspire                |
| **Diplomacy**    | CHA/INT      | Formal negotiations            |

### Skill Structure

```typescript
interface SocialSkill {
  id: string;
  name: string;
  primary_stat: Stat;
  secondary_stat?: Stat;
  difficulty_class: number;
  modifiers: SocialModifier[];
  critical_success: CriticalEffect;
  critical_failure: CriticalEffect;
}

interface SocialModifier {
  type: "relationship" | "reputation" | "mood" | "knowledge" | "circumstance" | "equipment";
  value: number;
  source: string;
}
```

## Persuasion System

### Persuasion Attempts

```typescript
interface PersuasionAttempt {
  persuader: Character;
  target: Character | NPC;
  argument: string;
  skill: SocialSkill;
  dc: number;
  modifiers: PersuasionModifier[];
  stakes: "low" | "medium" | "high" | "critical";
  result: PersuasionResult;
}

interface PersuasionModifier {
  type: "relationship" | "shared_interest" | "evidence" | "threat" | "bribe" | "mood";
  value: number;
  description: string;
}

interface PersuasionResult {
  success: boolean;
  confidence: number; // 0-100
  npc_response: NPCResponse;
  relationship_change: number;
  reputation_change: number;
  follow_through_chance: number; // Will NPC actually do what they agreed to
}
```

### Persuasion Strategies

| Strategy             | DC Modifier | Risk     |
| -------------------- | ----------- | -------- |
| **Logical Appeal**   | -5          | Low      |
| **Emotional Appeal** | -3          | Medium   |
| **Flattery**         | -2          | Low      |
| **Bribe**            | -10         | Medium   |
| **Threat**           | -8          | High     |
| **Blackmail**        | -15         | Critical |
| **Evidence**         | -12         | Low      |

## Intimidation System

### Intimidation Mechanics

```typescript
interface IntimidationAttempt {
  intimidator: Character;
  target: Character | NPC;
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
  retaliation_chance: number;
}
```

### Intimidation Factors

| Factor                    | Effect   |
| ------------------------- | -------- |
| **Size Difference**       | +/-5-15  |
| **Weapon Display**        | +5-10    |
| **Reputation**            | +/-10-20 |
| **Group Advantage**       | +5-15    |
| **Target's Courage**      | -10-10   |
| **Previous Relationship** | -20-20   |

## Deception System

### Deception Mechanics

```typescript
interface DeceptionAttempt {
  deceiver: Character;
  target: Character | NPC;
  lie: string;
  evidence: Evidence[];
  dc: number;
  modifiers: DeceptionModifier[];
  result: DeceptionResult;
}

interface DeceptionResult {
  success: boolean;
  belief_level: "complete" | "partial" | "suspicious" | "disbelief";
  suspicion_gained: number;
  insight_check: number;
  consequences: DeceptionConsequence[];
}
```

### Lie Detection

```typescript
interface InsightCheck {
  detector: Character;
  target: Character | NPC;
  statement: string;
  dc: number;
  tells: Tell[];
  result: InsightResult;
}

interface Tell {
  type: "body_language" | "voice" | "inconsistency" | "micro_expression";
  detectability: number;
  reliability: number; // 0-100
}

interface InsightResult {
  detected: boolean;
  confidence: number;
  specific_doubts: string[];
}
```

## Barter System

### Trading Mechanics

```typescript
interface BarterAttempt {
  seller: Character;
  buyer: Character | NPC;
  items: BarterItem[];
  asked_price: number;
  offered_price: number;
  dc: number;
  modifiers: BarterModifier[];
  result: BarterResult;
}

interface BarterItem {
  item: Item;
  quantity: number;
  base_value: number;
  perceived_value: number; // influenced by skills
}

interface BarterModifier {
  type: "relationship" | "reputation" | "supply_demand" | "urgency" | "skill";
  value: number;
}

interface BarterResult {
  success: boolean;
  final_price: number;
  profit: number;
  relationship_change: number;
  future_discount: number;
}
```

### Price Factors

| Factor            | Price Effect |
| ----------------- | ------------ |
| **High Supply**   | -10-30%      |
| **Low Supply**    | +10-50%      |
| **Urgency**       | +20-100%     |
| **Relationship**  | -10-20%      |
| **Reputation**    | -5-15%       |
| **Barter Skill**  | -5-25%       |
| **Bulk Purchase** | -5-15%       |

## Leadership System

### Leadership Mechanics

```typescript
interface Leadership {
  leader: Character;
  followers: Character[];
  morale: number; // 0-100
  loyalty: number; // 0-100
  effectiveness: number; // 0-100
  style: LeadershipStyle;
  commands: Command[];
}

type LeadershipStyle = "authoritarian" | "democratic" | "laissez_faire" | "transformational" | "servant";

interface Command {
  id: string;
  type: "move" | "attack" | "defend" | "retreat" | "hold" | "special";
  target: string;
  compliance_chance: number;
  execution_quality: number;
}
```

### Morale System

```typescript
interface MoraleState {
  current: number; // 0-100
  modifiers: MoraleModifier[];
  effects: MoraleEffect[];
  thresholds: MoraleThreshold[];
}

interface MoraleModifier {
  type: "victory" | "defeat" | "leader" | "environment" | "supply" | "rest";
  value: number;
  duration: number;
}

interface MoraleThreshold {
  level: number;
  effect: "inspired" | "normal" | "shaken" | "routed" | "mutiny";
  bonuses: StatModifier[];
}
```

## Reputation System

### Reputation Structure

```typescript
interface SocialReputation {
  character_id: string;
  global_fame: number; // -1000 to 1000
  faction_reputation: FactionReputation[];
  titles: Title[];
  achievements: Achievement[];
  rumors: Rumor[];
  public_opinion: PublicOpinion;
}

interface FactionReputation {
  faction_id: string;
  standing: number; // -1000 to 1000
  rank: FactionRank;
  titles: string[];
  benefits: FactionBenefit[];
}

interface PublicOpinion {
  trustworthiness: number; // -100 to 100
  generosity: number;
  cruelty: number;
  competence: number;
  charisma: number;
}
```

### Reputation Effects

| Standing      | Title      | Effects                         |
| ------------- | ---------- | ------------------------------- |
| -1000 to -500 | Hated      | Attack on sight, no services    |
| -499 to -100  | Unfriendly | Higher prices, limited services |
| -99 to 99     | Neutral    | Standard prices/services        |
| 100 to 499    | Friendly   | Discounts, special services     |
| 500 to 1000   | Exalted    | Best prices, unique rewards     |

## Social Encounters

### Dialogue System

```typescript
interface DialogueNode {
  id: string;
  speaker: string;
  text: string;
  options: DialogueOption[];
  conditions: DialogueCondition[];
  effects: DialogueEffect[];
}

interface DialogueOption {
  id: string;
  text: string;
  skill_check?: SocialSkillCheck;
  consequences: DialogueConsequence[];
  next_node: string;
}

interface SocialSkillCheck {
  skill: string;
  dc: number;
  modifiers: SocialModifier[];
  success_node: string;
  failure_node: string;
}
```

### Social Events

```typescript
interface SocialEvent {
  id: string;
  type: "feast" | "tournament" | "ball" | "council" | "negotiation" | "trial";
  participants: Character[];
  agenda: AgendaItem[];
  outcomes: SocialOutcome[];
  duration: number;
}
```

## Integration Points

- **RPG Mechanics** — CHA, WIS, INT stats affect social skills
- **NPC System** — NPC personality, memory, relationships
- **Faction System** — Faction reputation, standing
- **Economy System** — Barter, trading
- **Quest System** — Social quest objectives
- **Combat System** — Intimidation in combat

## Open Questions

- Should social skills be as powerful as combat skills?
- How to handle social PvP (player vs. player deception)?
- Should NPCs remember lies and react accordingly?
- How to balance social vs. combat solutions?
- Should there be social "combat" with its own initiative system?

## Files

- `src/rpg/social/` — social system
- `src/rpg/social/persuasion.ts` — persuasion mechanics
- `src/rpg/social/intimidation.ts` — intimidation mechanics
- `src/rpg/social/deception.ts` — deception mechanics
- `src/rpg/social/barter.ts` — barter system
- `src/rpg/social/leadership.ts` — leadership system
- `src/rpg/social/reputation.ts` — reputation system
- `src/rpg/social/dialogue.ts` — dialogue system
- `src/db/schema-social.ts` — social tables
- `src/routes/social.ts` — social API

## Related Epics

- **Epic RPG Mechanics** — Stats, skills
- **Epic NPC System** — NPC personality, memory
- **Epic Faction System** — Faction reputation
- **Epic Economy System** — Trading, barter
- **Epic Quest System** — Social objectives

## Linked Tasks

- TASK-social-interaction.md
