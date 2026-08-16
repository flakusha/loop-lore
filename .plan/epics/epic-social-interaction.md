<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

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

## NPC-to-NPC Social Simulation (Extension — Research-Driven)

The Stanford Generative Agents paper (Park et al., 2023) demonstrates that
NPC-to-NPC autonomous interactions create emergent social dynamics. The key
insight: NPCs decide whether to initiate conversations, generate dialogue
based on context and memory, and update relationships from interaction outcomes.

### Decision to Interact

NPCs evaluate whether to initiate or react to social interactions based on:

1. **Proximity** — are the NPCs in the same location?
2. **Current activity** — are they sleeping, chatting, or busy?
3. **Relationship state** — how do they feel about each other?
4. **Last interaction** — when did they last talk? What about?
5. **Current mood** — are they in a social mood?

```typescript
interface InteractionDecision {
  initiator_id: string;
  target_id: string;
  should_interact: boolean;
  reason: string;           // why they decided to talk (or not)
  context: {
    last_chat_time?: Date;
    last_chat_topic?: string;
    current_activities: string[];
    relationship_strength: number;
    mood_factor: number;
  };
}
```

### Conversation Generation

When two NPCs decide to interact, the system generates dialogue:

1. **Context retrieval** — pull relevant memories and relationship data
2. **Topic selection** — decide what to discuss based on current thoughts
3. **Utterance generation** — generate dialogue for each participant
4. **Summary creation** — summarize the conversation for memory storage

```typescript
interface NPCConversation {
  id: string;
  participants: string[];
  start_time: Date;
  end_time?: Date;
  location: string;
  topic: string;
  utterances: NPCUtterance[];
  summary?: string;
  relationship_impact: number; // -100 to 100: how it affected the relationship
}

interface NPCUtterance {
  speaker_id: string;
  content: string;
  emotional_tone: string;
  timestamp: Date;
}
```

### Emergent Social Dynamics

NPC-to-NPC interactions create emergent behaviors:

1. **Relationship evolution** — repeated positive interactions strengthen bonds;
   negative interactions weaken them
2. **Information propagation** — NPCs share knowledge through conversation
   (gossip, rumors, secrets)
3. **Social clustering** — NPCs with similar interests form groups
4. **Conflict emergence** — disagreements escalate into feuds
5. **Alliance formation** — NPCs cooperate against common threats

### Memory Integration

Conversations are stored in episodic memory and influence future interactions:

```typescript
interface SocialMemory {
  id: string;
  conversation_id: string;
  participants: string[];
  summary: string;
  emotional_valence: number; // -100 to 100
  importance: number;        // 0–100
  key_points: string[];      // what was discussed
  relationship_changes: Array<{
    target_id: string;
    strength_change: number;
    opinion_change: number;
  }>;
}
```

### Prompt Assembly

When generating NPC-to-NPC dialogue, the prompt includes:
1. **Relationship context** — how do they feel about each other?
2. **Recent interactions** — what did they last discuss?
3. **Current thoughts** — what's on their mind?
4. **Personality traits** — how do they express themselves?
5. **Mood state** — how are they feeling right now?

### Tasks

| Task | Description | Priority | Status |
|------|-------------|----------|--------|
| TASK-npc-social-decision | Implement `should_interact` logic for NPCs | High | Not Started |
| TASK-npc-social-conversation | NPC dialogue generation system | High | Not Started |
| TASK-npc-social-memory | Store and retrieve NPC conversation history | Medium | Not Started |
| TASK-npc-social-dynamics | Emergent social behavior system | Medium | Not Started |
| TASK-npc-social-prompt | Prompt assembly for NPC conversations | High | Not Started |
| TASK-npc-social-tests | Decision, conversation, memory, dynamics tests | High | Not Started |

### Open Questions

1. Should NPC-to-NPC conversations be visible to players, or only summarized?
2. How should NPCs handle sensitive information (secrets, betrayals)?
3. Should NPCs be able to lie to each other (deception mechanics)?
4. How should NPC social dynamics scale with world size?
5. Should NPCs be able to form groups/cliques, or only pairwise relationships?

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

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| RPG Mechanics | Stats (CHA, WIS, INT), skill checks | Social skill resolution via unified checks |
| NPC System | Personality, memory, relationships | NPC social state, relationship tracking |
| Faction & Reputation | Reputation, standing | Faction standing feeds social checks (G14) |
| Economy & Trading | Barter, trade mechanics | Trade/barter resolution |
| Quest System | Quest objectives | Social quest objectives (persuade, gossip, negotiate) |
| Crime & Stealth | Social-skill overlap | Deception/disguise aid crime; criminal reputation feeds social standing (G13) |
| Housing & Base Building | Social spaces | Guest interactions, party hosting |
| Character Core | Relationship state | NPC/player relationship model |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| RPG Mechanics | Social skill checks | Persuasion/intimidation/deception resolution |
| Faction & Reputation | Reputation standing | Faction relationships drive social gating (G14) |
| Economy & Trading | Barter, relationship pricing | Reputation-gated prices, trade favors |
| Battle & Action Systems | Intimidation, morale | Social checks in combat (G2) |
| NSFW Game Mechanics | Seduction prerequisites | Social skills are seduction prerequisites (G8) |
| Emergent Narrative Design | Consequence persistence | Social reputation persists narrative stakes |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `ReputationScore` | Faction, NSFW, Narrative | Unified reputation model (G14) — MUST match faction schema |
| `Relationship` | Character Core, Companion, NSFW | NPC/player relationship state |
| `SkillCheck` | Resolution, Battle, Social | Unified social check result model |
| `CharacterStats` | RPG, Character Core | CHA/WIS/INT feed social rolls |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `social.relationship_changed` | emits → CharCore, NPC | Relationship shifts update NPC memory |
| `social.reputation_changed` | emits → Faction, Crime | Standing changes propagate (G13/G14) |
| `resolution.roll` | subscribes ← Resolution | Social checks flow through unified resolver |

---

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
- TASK-social-guild-system.md
