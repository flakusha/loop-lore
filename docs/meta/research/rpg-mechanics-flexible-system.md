# RPG Mechanics Research: Flexible Universal System Design

## Overview

loop-lore's RPG system follows the principle: **"the LLM proposes, code disposes"**.
The engine validates, resolves, and applies game state while LLMs generate narrative.
This enables a **universal, flexible system** where the same mechanics work across
fantasy, sci-fi, modern, and custom settings.

---

## Core Design Principles

### 1. Toggleable Per World

RPG features are **optional per world** — disable for pure narrative RP at zero token cost:

```yaml
world:
  id: "elderwood-fantasy"
  rpg_enabled: true
  mechanics:
    dice: true
    stats: true
    combat: true
    skills: true
```

```yaml
world:
  id: "modern-mystery"
  rpg_enabled: false
  # Pure narrative investigation
```

### 2. Code-Enforced State

The engine is the **source of truth** for game state:

- Stats, HP, inventory validated on every change
- No LLM hallucination of impossible items or stat values
- Transactional updates prevent inconsistent state

### 3. Computed At Use Time

Equipment bonuses fold into **effective stats dynamically**:

```
effectiveStat = baseStat + equipmentBonus + statusEffectModifier + worldModifier
```

- Unequipping removes bonus instantly
- Status effects apply in real-time
- Base stat always reflects intrinsic ability

### 4. Prompt-Injectable

All tracked state injected into LLM prompts as structured sections:

```
[Character Stats — Sir Aldric]
Level 5 Human Fighter
HP: 38/45 | MP: 12/12
STR 16 (+3) | DEX 14 (+2) | CON 15 (+2) | INT 10 (+0) | WIS 12 (+1) | CHA 13 (+1)
AC: 17 | Initiative: +2
XP: 850/1050 (to next level)
Status: None

[Equipment]
Main Hand: Longsword (1d8+3 slashing)
Chest: Chain Mail (+6 AC)
Hands: Leather Gloves (+1 DEX)
```

---

## Universal d20 Foundation

### Core Mechanic

All uncertain outcomes resolve via **d20 + Modifier**:

```
result = d20() + statModifier + situationalModifier
```

This follows the **d20 System Reference Document** (d20srd.org) pattern:

- Universal across genres (fantasy, sci-fi, modern, horror)
- Simple to understand: roll high beats target number
- Extensible with situational modifiers

### Dice Notation

Standard RPG notation supported:

| Notation | Meaning               | Example Use                         |
| -------- | --------------------- | ----------------------------------- |
| `d4`     | 1 four-sided die      | Dagger damage (1d4)                 |
| `d6`     | 1 six-sided die       | Short sword (1d6)                   |
| `d8`     | 1 eight-sided die     | Longsword (1d8)                     |
| `d10`    | 1 ten-sided die       | Greatsword (2d6), but d10 for other |
| `d12`    | 1 twelve-sided die    | Battle axe (1d12)                   |
| `d20`    | 1 twenty-sided die    | Attack rolls, skill checks          |
| `2d6`    | 2 six-sided dice, sum | Fireball damage (variable)          |
| `1d8+3`  | Die + modifier        | Weapon with STR bonus               |

### Implementation Location

- Parser: `plugins/core/dice-roller/engine.ts`
- Types: `plugins/core/dice-roller/types.ts`
- Crypto-secure randomness via `crypto.getRandomValues`

---

## Stat System Architecture

### Core Attributes (Universal)

Six attributes form the foundation — applicable to any setting:

| Stat    | Governs                | Universal Examples                               |
| ------- | ---------------------- | ------------------------------------------------ |
| **STR** | Physical power, force  | Melee attacks, carrying capacity, breaking doors |
| **DEX** | Agility, reflexes      | Ranged attacks, AC, stealth, initiative          |
| **CON** | Health, endurance      | HP, disease resistance, exhaustion               |
| **INT** | Reasoning, knowledge   | Spellcasting (wizard), investigation, knowledge  |
| **WIS** | Perception, will       | Spellcasting (cleric), perception, insight       |
| **CHA** | Personality, influence | Spellcasting (sorcerer), persuasion, leadership  |

### Stat Modifiers

D&D 5e-style modifier calculation:

```
modifier = floor((stat - 10) / 2)
```

| Stat | Modifier |
| ---- | -------- |
| 1    | -5       |
| 8    | -1       |
| 10   | 0        |
| 12   | +1       |
| 16   | +3       |
| 20   | +5       |
| 30   | +10      |

### Effective Stats Pattern

```typescript
// Computed, not stored
function getEffectiveStat(
  baseStat: number,
  equipmentBonuses: Bonus[],
  statusEffects: StatusEffect[],
  worldModifiers: WorldModifier[],
): number {
  return (
    baseStat +
    equipmentBonuses.reduce((s, b) => s + b.value, 0) +
    statusEffects.reduce((s, e) => s + e.statModifiers[str], 0) +
    worldModifiers.reduce((s, w) => s + w.value, 0)
  );
}
```

---

## Item System (Three-Tier)

### Tier 1: Item Definitions (Templates)

World-scoped templates — reusable definitions:

```json
{
  "id": "longsword-template",
  "name": "Longsword",
  "category": "weapon",
  "slot": "mainHand",
  "damage_dice": "1d8",
  "damage_type": "slashing",
  "stat_requirements": { "str": 13 },
  "rarity": "common"
}
```

### Tier 2: World Item Instances

Items placed in the world — on ground, in containers, carried by NPCs:

```json
{
  "id": "item-instance-123",
  "item_template_id": "longsword-template",
  "location_id": "dungeon-chest-1",
  "quantity": 1,
  "visibility": "visible",
  "respawnable": false
}
```

### Tier 3: Actor Inventory + Equipment

Items carried/equipped by actors:

```json
{
  "id": "actor-item-456",
  "actor_id": "character-789",
  "item_template_id": "longsword-template",
  "equipped": true,
  "slot": "mainHand",
  "durability": 100
}
```

### Equipment Slots

| Slot          | Accepts              | Stat Affects         |
| ------------- | -------------------- | -------------------- |
| `head`        | Helmets, hoods       | AC, WIS (perception) |
| `chest`       | Armor, robes         | AC, DEX (stealth)    |
| `legs`        | Greaves, pants       | AC, DEX              |
| `feet`        | Boots, sandals       | DEX (speed)          |
| `hands`       | Gloves, gauntlets    | DEX, STR (grip)      |
| `mainHand`    | Weapons, tools       | STR/DEX (attack)     |
| `offHand`     | Shields, off-weapons | AC, STR              |
| `ring1/ring2` | Rings                | Any (varies)         |
| `amulet`      | Amulets, necklaces   | Any (varies)         |
| `cloak`       | Cloaks, capes        | AC, CHA              |

---

## Combat System

### Intent Extraction

LLM outputs structured intent alongside narrative:

```json
[COMBAT_INTENT]
{
  "intent": "attack",
  "target": "goblin-123",
  "weapon": "longsword",
  "advantage": false,
  "modifier": 3
}
[/COMBAT_INTENT]
```

### Resolution Pipeline

1. **Parse intent** from LLM response (regex + JSON)
2. **Roll attack**: `d20() + attackModifier` vs target AC
3. **Roll damage**: `weaponDamageDice + STR modifier` (if hit)
4. **Apply results**: Update HP, check defeat, apply status effects
5. **Feed back**: "HIT — 7 damage. Target HP: 23/45."
6. **LLM narrates** the mechanical truth

### Damage Formula

```
physicalDamage = weaponDamageDice + STR modifier
magicalDamage = spellDamageDice + INT/WIS/CHA modifier
reducedDamage = max(1, rawDamage - target.armorReduction)
```

### Status Effects

| Effect    | Mechanic                             | Duration      |
| --------- | ------------------------------------ | ------------- |
| Poisoned  | -2 to all rolls, 1d4 damage/turn     | 1d4 turns     |
| Stunned   | Cannot act, auto-fail DEX saves      | 1 turn        |
| Blessed   | +2 to all rolls                      | 1d4 turns     |
| Cursed    | -2 to all rolls, cannot heal         | Until removed |
| Burning   | 1d6 damage/turn, -2 DEX              | 1d4 turns     |
| Frozen    | Speed halved, -4 DEX                 | 1d4 turns     |
| Haste     | +2 DEX, extra action/turn            | 1d4 turns     |
| Weakened  | -4 STR                               | 1d4 turns     |
| Shielded  | +3 AC                                | Until hit     |
| Invisible | Advantage on stealth, auto-hit first | 1 minute      |

---

## Skill Check System

### Skills (Attribute-Derived)

Skills map to attributes — universal across settings:

| Skill           | Primary Stat | Universal Use Cases             |
| --------------- | ------------ | ------------------------------- |
| Athletics       | STR          | Climbing, swimming, jumping     |
| Acrobatics      | DEX          | Balancing, tumbling, dodging    |
| Stealth         | DEX          | Hiding, sneaking, lockpicking   |
| Perception      | WIS          | Spotting, listening, noticing   |
| Arcana          | INT          | Magic knowledge, spell analysis |
| Investigation   | INT          | Searching, deducing, analyzing  |
| Medicine        | WIS          | Healing, diagnosing, surgery    |
| Survival        | WIS          | Tracking, foraging, shelter     |
| Persuasion      | CHA          | Negotiating, inspiring, lying   |
| Intimidation    | CHA          | Threatening, commanding         |
| Animal Handling | WIS          | Taming, riding, calming         |
| History         | INT          | Recall lore, ancient knowledge  |

### Difficulty Classes (Universal)

| DC  | Label             | Examples Across Genres                   |
| --- | ----------------- | ---------------------------------------- |
| 5   | Trivial           | Open unlocked door, simple recall        |
| 10  | Easy              | Climb rope, basic computer use           |
| 15  | Medium            | Pick locked chest, hack basic system     |
| 20  | Hard              | Lie to expert, bypass security           |
| 25  | Very Hard         | Sneak past guards, forge documents       |
| 30  | Nearly Impossible | Disguise as VIP, create untraceable hack |

### Skill Check Resolution

Two modes:

**Deterministic (Sequential Combat)**

- Pre-generated dice queue
- LLM narrates around fixed outcomes
- Prevents sycophancy

**Narrative (Skill Checks)**

- LLM calls tool: `rollSkillCheck(stat="dex", dc=15)`
- Engine rolls and returns result
- LLM narrates based on outcome

---

## XP and Leveling System

### XP Sources

| Source           | XP      | Notes                      |
| ---------------- | ------- | -------------------------- |
| Quest complete   | 100-500 | Scales with difficulty     |
| Combat (defeat)  | 25-200  | Scales with enemy level    |
| Discovery        | 10-50   | Finding secrets, locations |
| Social (success) | 10-30   | Persuasion, negotiation    |
| Creative solve   | 20-100  | GM awards for clever plays |

### Level Progression

```
XP to next level = currentLevel * 100 + 50
```

| Level | XP Required | XP to Next |
| ----- | ----------- | ---------- |
| 1     | 0           | 150        |
| 2     | 150         | 250        |
| 3     | 400         | 350        |
| 5     | 1000        | 550        |
| 10    | 4750        | 1050       |
| 15    | 12000       | 1550       |
| 20    | 21500       | —          |

### Level Up Effects

```typescript
// On level up:
maxHp += conModifier + 5;
maxMp += intModifier + 3;
// Every 4 levels: +1 to one attribute (player choice)
// Certain levels unlock world-defined abilities
```

---

## Currency System

### Exchange Rates

| Currency | To Gold |
| -------- | ------- |
| Copper   | 0.01    |
| Silver   | 0.10    |
| Gold     | 1.00    |
| Platinum | 10.00   |

### Shopkeeper Interaction

Shop transactions tracked as events:

```
1. Player requests purchase
2. Engine validates: sufficient currency, item in stock
3. Currency transferred (tracked as asset)
4. Item moved to inventory
5. LLM narrates transaction
```

---

## Flexible Rules Engine

### World Configuration

Each world defines its own rules:

```yaml
world:
  id: "cyberpunk-neo-tokyo"
  rules:
    # Override default mechanics
    stat_cap: 20
    max_level: 30
    death_condition: "hp_0_or_crippled"

    # Genre-specific
    cybernetics_enabled: true
    hacking_difficulty_base: 15

    # Custom attributes
    attributes:
      - str
      - dex
      - con
      - int
      - wis
      - cha
      - tech # Custom: hacking, electronics
      - cool # Custom: social, stress resistance
```

### Rules Modules

The system supports **modular rules** that can be mixed:

| Module      | Provides                     | Compatible With   |
| ----------- | ---------------------------- | ----------------- |
| Core d20    | d20 rolls, stat mods         | All               |
| Combat      | Attack/damage, HP, AC        | All               |
| Skills      | Skill checks, DC table       | All               |
| Magic       | Spells, mana, spell DC       | Fantasy, Modern   |
| Cybernetics | Implants, humanity           | Cyberpunk, Sci-fi |
| Vehicles    | Vehicle combat, speed        | Modern, Sci-fi    |
| Sanity      | Sanity stat, madness effects | Horror            |

---

## Comparison to Existing Systems

### GATEWAY RPG (Free d20 Framework)

- **Similarities**: d20 core mechanic, universal compatibility
- **Advantages**: loop-lore adds LLM integration, automated state management
- **Differences**: GATEWAY is manual; loop-lore automates dice rolls, state updates

### FATE Core (Narrative-Focused)

- **Similarities**: Aspects, stress tracks, flexible
- **Differences**: FATE uses Fudge dice; loop-lore uses d20
- **Hybrid potential**: Aspects could map to lore entries

### Savage Worlds (Cinematic)

- **Similarities**: Wildcards, bennies, fast combat
- **Differences**: loop-lore's deterministic mode better for LLM consistency

---

## Implementation Phases

### Phase 1: Dice Engine (Done)

- `plugins/core/dice-roller/engine.ts`
- Cryptographically secure rolls
- Standard notation support

### Phase 2: Stat System (Planned)

- Stat block interface on actors
- Effective stat computation
- Prompt injection

### Phase 3: Combat System (Planned)

- Combat intent extraction
- Attack/damage resolution
- Status effects

### Phase 4: Items & Equipment (Planned)

- Item templates
- Equipment slots
- Equip/unequip flow

### Phase 5: Skills & XP (Planned)

- Skill definitions
- DC table
- XP tracking

---

## Key Architectural Decisions

### 1. No Boolean Flags — Enums Instead

Status columns use state machines:

```typescript
// Good
equipped: "equipped" | "unequipped";

// Bad
equipped: boolean;
```

### 2. Dual-State Actors

Characters separate identity from world-specific state:

```
Actors (static) → one-to-many → WorldActorState (dynamic)
   WorldActorState: stats, inventory, equipment, status_effects, relationships
```

### 3. Event-Driven Updates

World state changes via events:

```
LLM Response → Event Extractor → Validator → Applier
```

### 4. Synthetic Testing

All mechanics validated via generated test scenarios:

- Turn sequences
- Combat outcomes
- Skill check distributions
- XP progression curves

---

## Standing & Reputation System

### Actor Standing Framework

Reputation tracks how actors are perceived across the world:

```typescript
interface ActorStanding {
  actorId: string;
  worldId: string;

  // Reputation tracks
  reputation: {
    faction: string; // Faction ID
    score: number; // -100 (hated) to +100 (revered)
    tier: "unknown" | "neutral" | "friendly" | "ally" | "hero" | "legend";
  }[];

  // Individual relationships
  relationships: {
    targetActorId: string;
    disposition: number; // -10 (hostile) to +10 (close friend)
    trust: number; // 0-10
    fear: number; // 0-10
    respect: number; // 0-10
    notes: string;
  }[];

  // Standing effects
  effects: {
    shop_prices: number; // Modifier to prices (-0.5 = 50% off)
    quest_availability: string[]; // Quest IDs unlocked
    npc_reactions: string[]; // Reaction modifiers
    service_access: string[]; // Services unlocked
  };
}
```

### Standing Change Events

```typescript
interface StandingChangeEvent {
  type: "quest_complete" | "item_gift" | "combat" | "dialogue" | "discovery";
  sourceActorId: string;
  targetActorId: string;
  amount: number; // Positive or negative
  reason: string; // Narrative justification
}

// Example: Quest completion affects standing
const QUEST_STANDING: Record<string, { faction: string; amount: number }> = {
  goblin_cave_clear: { faction: "village", amount: 15 },
  artifact_returned: { faction: "mages_guild", amount: 25 },
  betrayal: { faction: "kingdom", amount: -30 },
};
```

### Standing Decay

```typescript
// Monthly decay toward neutral
function calculateStandingDecay(current: number, monthsElapsed: number): number {
  const decayRate = 0.1; // 10% per month
  const decay = current * decayRate * monthsElapsed;
  return Math.sign(current) * Math.max(0, Math.abs(current) - decay);
}
```

---

## Social Conflict System

### Social Intent

```typescript
interface SocialIntent {
  type: "persuade" | "intimidate" | "deceive" | "insight" | "performance";
  target: string;
  approach: string; // How the actor is attempting it
  stakes: string; // What's at risk

  // Optional modifiers
  modifiers?: {
    item?: string; // Item used (gift, bribe)
    standing?: number; // Standing modifier
    status?: string[]; // Relevant status effects
  };
}
```

### Social Resolution

```typescript
function resolveSocial(
  intent: SocialIntent,
  actor: Actor,
  target: Actor
): SocialResult {
  const dc = calculateSocialDC(target, intent.type);
  const roll = d20() + getStatModifier(actor, intent.type) + (intent.modifiers?.standing ?? 0);

  return {
    success: roll >= dc,
    degree: roll - dc, // Success/failure margin
    standingChange: roll >= dc ? 5 : -5,
    backlash: roll < dc - 10, // Significant failure
  };
}
```

### Social Skills

| Skill | Stat | Use Case |
| ----- | ---- | -------- |
| Persuasion | CHA | Negotiating, convincing |
| Intimidation | STR/CHA | Threatening, coercion |
| Deception | CHA | Lying, disguise, forgery |
| Insight | WIS | Reading intentions, detecting lies |
| Performance | CHA | Acting, music, public speaking |
