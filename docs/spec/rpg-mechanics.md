# RPG Mechanics Specification

## Philosophy: Mechanics Serve Narrative

loop-lore's RPG system follows one principle: **the LLM proposes, code
disposes**. The LLM generates narrative and structured intent. The engine
validates, resolves, and applies. The LLM never directly mutates game state.

This eliminates hallucinated items, impossible stat changes, and narrative
contradictions — while keeping the creative narrative generation where LLMs
excel.

**Design constraints:**

1. Mechanics are **toggleable per world** — disable all RPG features for pure
   narrative RP at zero token cost
2. State is **code-enforced** — the engine is the source of truth
3. Effects are **computed at use time** — equipment bonuses fold into effective
   stats dynamically, not stored permanently
4. Everything is **prompt-injectable** — whatever state the engine tracks, the
   LLM sees via structured prompt sections
5. **LLM text is never wasted** — structured intent is extracted from narrative,
   not bolted on as a separate API call

---

## Dual-State Character Model

A character exists in two states simultaneously:

### Static State (Character Card)

Travels between worlds. Defined once, used everywhere. Contains:

- Identity (name, avatar, description)
- Voice (personality, speech patterns, example dialogue)
- Base stat block (if any — see Stat System below)
- Default equipment template

### Dynamic State (World-Specific)

Per-world. Created when a character enters a world. Contains:

- Current stats (HP, MP, level, XP)
- Inventory (items carried)
- Equipment (items equipped in slots)
- Status effects (active buffs/debuffs)
- Relationships (disposition toward other actors)
- Knowledge (what this character knows in this world)
- Location (where they are in this world)

```
Actors (static) ──1:N── WorldActorState (dynamic, per world)
                          ├── stats (computed from base + equipment)
                          ├── inventory (items table)
                          ├── equipment (equipped items)
                          ├── status_effects (active conditions)
                          ├── relationships (disposition map)
                          └── knowledge (learned facts)
```

**Why this matters:** The same character can be a powerful mage in one world
and a helpless villager in another. Their stats, inventory, and relationships
are world-scoped. The character card defines who they _are_; the world state
defines what they _have_ and what they _can do_.

---

## Stat System

### Core Attributes

Six attributes form the foundation. Every character has base values (from
the character card or default template):

| Abbrev | Full Name    | Governs                           |
| ------ | ------------ | --------------------------------- |
| STR    | Strength     | Melee damage, carry weight, force |
| DEX    | Dexterity    | Ranged attacks, evasion, speed    |
| CON    | Constitution | HP, resistances, endurance        |
| INT    | Intelligence | Arcane power, skill learning      |
| WIS    | Wisdom       | Perception, willpower, healing    |
| CHA    | Charisma     | Persuasion, barter, leadership    |

### Stat Block Interface

```typescript
interface StatBlock {
  // Base attributes (from character card or world default)
  str: number; // 1–30, default 10
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;

  // Derived stats (computed, not stored)
  maxHp: number; // = con * 5 + level * 2
  hp: number; // current, mutable
  maxMp: number; // = int * 3 + wis * 2
  mp: number; // current, mutable
  initiative: number; // = dex + random(1,20)
  armorClass: number; // = 10 + dex modifier + armor bonus
  carryCapacity: number; // = str * 10 (lbs)
  level: number; // 1–20
  xp: number; // current XP
  xpToNext: number; // computed from level
}
```

### Stat Modifiers

Attributes produce modifiers (like D&D 5e):

```
modifier = floor((stat - 10) / 2)
```

| Stat | 1   | 8   | 10  | 12  | 16  | 20  | 30  |
| ---- | --- | --- | --- | --- | --- | --- | --- |
| Mod  | -5  | -1  | 0   | +1  | +3  | +5  | +10 |

### Effective Stats (Computed at Use Time)

When the engine needs a stat value, it computes the **effective stat**:

```
effectiveStat = baseStat + equipmentBonus + statusEffectModifier + worldModifier
```

Equipment and status effects never modify the stored base stat — they're
applied as layered modifiers at computation time. This means:

- Unequipping an item instantly removes its bonus
- A "poisoned" debuff applies in real-time
- The base stat always reflects the character's intrinsic ability

---

## Item System (Three-Tier)

### Tier 1: Item Definitions (Templates)

World-scoped templates. Reusable. Defined once, instanced many times.

```typescript
interface ItemDefinition {
  id: string;
  worldId: string;
  name: string;
  description: string;
  category: ItemCategory; // weapon, armor, consumable, key_item, etc.
  rarity: ItemRarity; // common → unique
  stackable: boolean;
  maxStack: number;
  properties: ItemProperties; // type-specific data
  value: number; // gold value
  weight: number; // encumbrance
}

// Type-specific properties
interface WeaponProperties {
  damageDice: string; // "2d6", "1d8+3"
  damageType: string; // "slashing", "piercing", "fire"
  range: number; // feet
  twoHanded: boolean;
  statBonus: Partial<StatBlock>; // e.g. { str: +2 }
  effects?: ItemEffect[];
}

interface ArmorProperties {
  acBonus: number;
  statBonus: Partial<StatBlock>;
  stealthDisadvantage: boolean;
  effects?: ItemEffect[];
}

interface ConsumableProperties {
  effect: ItemEffect;
  charges: number;
}

interface ItemEffect {
  type: "heal" | "buff" | "debuff" | "teleport" | "summon" | "custom";
  stat?: keyof StatBlock;
  value?: number;
  duration?: number; // turns, or -1 for permanent
  description: string;
}
```

### Tier 2: World Item Instances

Items placed in the world — on the ground, in containers, carried by NPCs.
Already implemented in `src/story/items.ts`.

```typescript
interface WorldItem {
  id: string; // world_items.id
  itemId: string; // → item definitions
  worldId: string;
  locationId?: string; // where in the world
  ownerActorId?: string; // who's carrying it
  quantity: number;
  isHidden: boolean;
  respawnable: boolean;
  spawnCondition?: Record<string, unknown>;
}
```

### Tier 3: Actor Inventory + Equipment

Items carried by an actor (user character, NPC, or impersonated persona).
Extends the existing `world_items` with equipment state.

```typescript
interface ActorInventory {
  actorId: string;
  worldId: string;
  items: InventorySlot[];
  equipped: EquipmentLoadout;
  gold: number; // convenience — also an item, but fast-access
  weight: number; // computed: sum of item weights
  capacity: number; // computed: str * 10
}

interface InventorySlot {
  worldItemId: string;
  itemId: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  properties: ItemProperties;
}

interface EquipmentLoadout {
  head: string | null; // world_item_id
  chest: string | null;
  legs: string | null;
  feet: string | null;
  hands: string | null; // gloves/shields
  mainHand: string | null; // weapon
  offHand: string | null; // shield/weapon/torch
  ring1: string | null;
  ring2: string | null;
  amulet: string | null;
  cloak: string | null;
}
```

### Equipment Slots

| Slot       | Accepts              | Stat Affects         |
| ---------- | -------------------- | -------------------- |
| `head`     | Helmets, hoods       | AC, WIS (perception) |
| `chest`    | Armor, robes         | AC, DEX (stealth)    |
| `legs`     | Greaves, pants       | AC, DEX              |
| `feet`     | Boots, sandals       | DEX (speed)          |
| `hands`    | Gloves, gauntlets    | DEX, STR (grip)      |
| `mainHand` | Weapons, tools       | STR/DEX (attack)     |
| `offHand`  | Shields, off-weapons | AC, STR              |
| `ring1`    | Rings                | Any (varies)         |
| `ring2`    | Rings                | Any (varies)         |
| `amulet`   | Amulets, necklaces   | Any (varies)         |
| `cloak`    | Cloaks, capes        | AC, CHA              |

### Equip/Unequip Flow

```
1. Player requests equip (LLM narrative or UI action)
2. Engine validates:
   - Item is in actor's inventory
   - Item category matches slot
   - Slot is empty (or swap with currently equipped)
3. If slot occupied: unequip current item → back to inventory
4. Equip new item: move from inventory to equipment slot
5. Recompute effective stats (base + all equipment bonuses)
6. Update prompt context for future generations
```

---

## Dice Engine

### Core Mechanic: d20 + Modifier

The universal resolution mechanic. When an outcome is uncertain:

```
result = d20() + statModifier + situationalModifier
```

### Dice Notation

Standard RPG dice notation:

| Notation | Meaning               |
| -------- | --------------------- |
| `d4`     | 1 four-sided die      |
| `d6`     | 1 six-sided die       |
| `d8`     | 1 eight-sided die     |
| `d10`    | 1 ten-sided die       |
| `d12`    | 1 twelve-sided die    |
| `d20`    | 1 twenty-sided die    |
| `2d6`    | 2 six-sided dice, sum |
| `1d8+3`  | 1 eight-sided die + 3 |

### Dice Parser

```typescript
function rollDice(notation: string): { total: number; rolls: number[]; modifier: number };
```

### Pre-Seeded Dice Queue (Deterministic Mode)

For sequential combat where fairness matters, the engine pre-generates a
queue of dice rolls before the LLM writes the narrative. The LLM narrates
around pre-determined outcomes:

```
Before turn:
  diceQueue = [14, 7, 18, 3, 11, ...]  // pre-generated

LLM prompt includes:
  "The goblin attacks. (SYSTEM: attack roll = 14, AC = 13, HIT)"

LLM narrates:
  "The goblin swings its rusty blade, catching you across the arm..."
```

### Tool-Call Dice (Narrative Mode)

For skill checks where the LLM should declare difficulty before seeing
the result (prevents sycophancy):

```
LLM calls: rollSkillCheck(stat="dex", dc=15)
Engine rolls: d20() + dexModifier = 12
Result: FAIL

LLM sees: "You attempt to leap the chasm. (RESULT: FAIL — rolled 12 vs DC 15)"
LLM narrates: "Your foot catches the edge. You scramble back, barely catching yourself..."
```

---

## Combat System

### "LLM Proposes, Code Disposes"

Combat in loop-lore is **narrative-first, mechanically-resolved**. The LLM
writes what happens; the engine determines what's _true_.

### Combat Intent (Structured Output)

When combat begins, the LLM outputs structured intent alongside narrative:

```typescript
interface CombatIntent {
  action: "attack" | "defend" | "cast" | "flee" | "use_item" | "grapple" | "help";
  target?: string; // actor_id of target
  weapon?: string; // world_item_id of weapon used
  spell?: string; // spell name if casting
  item?: string; // world_item_id if using item
  description: string; // narrative text (what the LLM writes)
}
```

### Resolution Pipeline

```
1. LLM generates narrative + CombatIntent (structured JSON in response)
2. Engine extracts intent (regex + JSON parsing)
3. Engine resolves mechanically:
   a. Attack: d20 + attackModifier vs target AC
   b. Damage: weapon damageDice + STR modifier
   c. Spell: d20 + INT modifier vs target spell resistance
   d. Skill check: d20 + relevant modifier vs DC
4. Engine applies results:
   a. Update HP (attacker/defender)
   b. Apply status effects (if any)
   c. Check for defeat (HP ≤ 0)
   d. Update world state
5. Engine feeds results back to LLM:
   "HIT — 7 damage. Target HP: 23/45. No status effects applied."
6. LLM narrates the mechanical truth in narrative form
```

### Damage Formula

```
physicalDamage = weaponDamageDice + STR modifier
magicalDamage = spellDamageDice + INT modifier
reducedDamage = max(1, rawDamage - target.armorReduction)
```

### Status Effects

Active conditions that modify stats or behavior:

| Effect    | Mechanic                                    | Duration      |
| --------- | ------------------------------------------- | ------------- |
| Poisoned  | -2 to all rolls, 1d4 damage per turn        | 1d4 turns     |
| Stunned   | Cannot act, auto-fail DEX saves             | 1 turn        |
| Blessed   | +2 to all rolls                             | 1d4 turns     |
| Cursed    | -2 to all rolls, cannot heal naturally      | Until removed |
| Burning   | 1d6 damage per turn, -2 DEX                 | 1d4 turns     |
| Frozen    | Speed halved, -4 DEX                        | 1d4 turns     |
| Haste     | +2 DEX, extra action per turn               | 1d4 turns     |
| Weakened  | -4 STR                                      | 1d4 turns     |
| Shielded  | +3 AC                                       | Until hit     |
| Invisible | Advantage on stealth, auto-hit first attack | 1 minute      |

Status effects are stored on the actor's world state and injected into
the prompt as a structured section:

```
[Status Effects]
- Poisoned: -2 all rolls, 1d4/turn (2 turns remaining)
- Haste: +2 DEX, extra action (1 turn remaining)
```

---

## Skill Check System

### Skills

Skills are derived from attributes:

| Skill           | Primary Stat | Use Case                        |
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

### Difficulty Classes

| DC  | Label             | Example                   |
| --- | ----------------- | ------------------------- |
| 5   | Trivial           | Open an unlocked door     |
| 10  | Easy              | Climb a rope              |
| 15  | Medium            | Pick a locked chest       |
| 20  | Hard              | Lie to a master detective |
| 25  | Very Hard         | Sneak past a dragon       |
| 30  | Nearly Impossible | Disguise as the king      |

### Skill Check Resolution

```
1. LLM describes intent: "I try to sneak past the guard"
2. LLM (or UI) calls: skillCheck("stealth", dc=15)
3. Engine rolls: d20() + stealthModifier(DEX + proficiency) = 17
4. Result: SUCCESS (17 ≥ 15)
5. LLM narrates the success
```

---

## XP and Leveling

### XP Sources

| Source           | XP      | Notes                          |
| ---------------- | ------- | ------------------------------ |
| Quest complete   | 100-500 | Scales with quest difficulty   |
| Combat (defeat)  | 25-200  | Scales with enemy level        |
| Discovery        | 10-50   | Finding secrets, new locations |
| Social (success) | 10-30   | Persuasion, negotiation        |
| Creative solve   | 20-100  | GM/DM awards for clever plays  |

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

When a character levels up:

```
maxHp += conModifier + 5
maxMp += intModifier + 3
// Every 4 levels: +1 to one attribute (player choice)
// Certain levels unlock new abilities (world-defined)
```

### XP Injection into Prompt

```
[Character Stats — {{char}}]
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

## Currency System

Currency is an item with special properties. The engine tracks gold
separately for fast access but it's still an item under the hood.

```typescript
interface CurrencyItem {
  category: "currency";
  properties: {
    denomination: "copper" | "silver" | "gold" | "platinum";
    exchangeRate: number; // relative to gold: copper=0.01, silver=0.1, gold=1, platinum=10
  };
}
```

### Exchange Rates

| Currency | To Gold |
| -------- | ------- |
| Copper   | 0.01    |
| Silver   | 0.10    |
| Gold     | 1.00    |
| Platinum | 10.00   |

### Shopkeeper Interaction

When a player buys/sells:

```
1. LLM narrates: "The merchant examines the sword. 'I'll give you 50 gold.'"
2. Player confirms purchase
3. Engine validates: player has ≥ 50 gold
4. Engine executes: remove 50 gold, add sword to inventory
5. LLM narrates the transaction
```

---

## Loot System

### Loot Tables

Each enemy type or container can have a loot table:

```typescript
interface LootTable {
  entries: LootEntry[];
  rolls: number; // how many times to roll on the table
}

interface LootEntry {
  itemId: string;
  weight: number; // relative probability
  minQuantity: number;
  maxQuantity: number;
  chance: number; // 0-1, independent chance per entry
}
```

### Loot Generation

```
1. Enemy defeated (HP ≤ 0)
2. Engine loads loot table for enemy type
3. For each roll:
   a. Roll d100
   b. Select entry by cumulative weight
   c. Roll quantity within min/max
   d. Add to world items at enemy's location
4. LLM narrates: "The goblin collapses. On its body you find a rusty sword and 12 gold pieces."
```

---

## Persona ↔ World Interaction

### Persona World Traits

When a persona enters a world for the first time, they receive a **world
trait** based on the world's theme and the persona's description:

```typescript
interface WorldTrait {
  worldId: string;
  trait: string; // "Outsider", "Native", "Chosen One", etc.
  description: string; // Narrative justification
  statModifications: Partial<StatBlock>;
  narrativeHooks: string[]; // Story seeds based on the trait
}
```

**Example:** A sci-fi persona entering a fantasy world gets the "Fish Out of
Water" trait: -2 WIS (unfamiliar world), +2 INT (advanced knowledge from
another world), narrative hooks about technology vs magic.

### Persona → Character Conversion (Expanded)

When a user converts a persona into a character (for impersonation or
self-play):

1. Copy name, avatar, description
2. Generate default stat block from description (LLM-assisted):
   - "A battle-hardened warrior" → STR 16, CON 14, DEX 12
   - "A scholarly mage" → INT 18, WIS 14, STR 8
3. Create as actor with `actor_type='character'`
4. User can then customize stats, add equipment, etc.

### Character → Persona Conversion (Reverse)

When a user wants to "become" an existing character:

1. Copy name, avatar, description to a new persona
2. The persona inherits the character's stat block as a starting point
3. In future chats using this persona, the user plays with those stats

This enables: "I created a powerful wizard character. Now I want to play AS
that wizard in a new story."

---

## Chat Rules System

### Overview

The chat rules system enables **optional, scoped activation** of gameplay
mechanics. Rules are defined at three scope levels and cascade by specificity:

- **World** — rules apply to all chats in a given world
- **Chat / Group Chat** — rules apply to a single chat (overrides world)
- **Location** — rules apply within a specific location (overrides chat/world)

This enables scenarios like:

- "No magic zone" in a specific location (Location rule)
- "PvP is allowed" in a group chat (Chat rule)
- "All fire damage is doubled" in a volcanic world (World rule)
- "Stealth checks have advantage" in a dark forest (Location rule)

### Cascade Priority

Rules cascade from most specific to least specific. The engine resolves
conflicts by picking the **most specific applicable rule**:

```
Location rule  >  Chat rule  >  World rule
```

For each check or action, the engine:

1. Checks if a Location rule applies (if actor is in a location)
2. If none: checks Chat/Group Chat rule
3. If none: checks World rule
4. If none: uses default (no rule)

**Multiple rules at the same scope** are resolved by `priority` (higher wins).
If priority is equal, the rule defined later (more recent) wins.

### Rule Types

Each rule has a type that determines how it modifies gameplay:

| Type                  | Effect                                | Example                                |
| --------------------- | ------------------------------------- | -------------------------------------- |
| `stat_modifier`       | Adjusts a stat by a fixed amount      | `-2 STR` in cursed zone                |
| `dc_adjustment`       | Modifies DC for specific skill checks | `+5 DC` for stealth in bright area     |
| `action_prohibition`  | Prevents specific actions             | `no casting` in anti-magic zone        |
| `effect_trigger`      | Applies status effect on entry/action | `apply burning` in lava room           |
| `auto_roll`           | Forces automatic outcomes             | `auto-fail perception` in fog          |
| `damage_modifier`     | Multiplies/adds to damage types       | `fire damage x2` in desert             |
| `resistance_modifier` | Adds/removes damage resistances       | `+resistance cold` in arctic           |
| `turn_limit`          | Caps turn duration or actions         | `1 action per turn` in slow-time field |
| `custom`              | Arbitrary plugin-defined behavior     | Plugin-specific rule logic             |

### Rule Schema

```typescript
interface ChatRule {
  id: string;
  name: string;
  description: string;

  // Scope (exactly one set)
  worldId?: string; // World scope
  chatId?: string; // Chat/Group Chat scope
  locationId?: string; // Location scope

  // Rule definition
  type: RuleType;
  config: RuleConfig; // Type-specific parameters

  // Activation
  enabled: boolean;
  priority: number; // 0-1000, higher = overrides lower
  conditions?: RuleCondition[]; // Optional: rule only applies when conditions met

  // Metadata
  source: "gm" | "plugin" | "system" | "user";
  pluginId?: string; // If rule is provided by a plugin
  createdAt: string;
  updatedAt: string;
}

interface RuleConfig {
  // stat_modifier
  stat?: string; // 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | 'hp' | 'mp' | 'ac'
  modifier?: number; // +/- value

  // dc_adjustment
  skill?: string; // Skill name or 'all'
  dcDelta?: number; // +/- DC adjustment

  // action_prohibition
  prohibitedActions?: string[]; // 'cast', 'attack', 'flee', 'use_item', 'grapple'

  // effect_trigger
  effect?: string; // Status effect name
  duration?: number; // Turns
  trigger?: "on_enter" | "on_action" | "on_turn_start" | "on_damage_taken";

  // damage_modifier
  damageType?: string; // 'fire', 'cold', 'lightning', 'slashing', 'bludgeoning', 'piercing'
  damageMultiplier?: number; // 2.0 = double, 0.5 = half
  damageFlat?: number; // +/- flat damage

  // custom
  pluginData?: Record<string, unknown>; // Arbitrary plugin-specific config
}

interface RuleCondition {
  type:
    | "actor_has_effect"
    | "actor_stat_above"
    | "actor_stat_below"
    | "time_of_day"
    | "weather"
    | "actor_count"
    | "quest_active"
    | "has_item"
    | "is_actor_type";
  target?: string; // E.g. effect name, stat name, item id
  value?: string | number; // Comparison value
}
```

### Rule Storage

Rules are stored in a dedicated `chat_rules` table:

| Column      | Type    | Constraints                 | Notes                            |
| ----------- | ------- | --------------------------- | -------------------------------- |
| id          | TEXT    | PK, UUID                    |                                  |
| world_id    | TEXT    | FK → worlds.id, nullable    | World-scoped rule                |
| chat_id     | TEXT    | FK → chats.id, nullable     | Chat/group-chat-scoped rule      |
| location_id | TEXT    | FK → locations.id, nullable | Location-scoped rule             |
| name        | TEXT    | NOT NULL                    | Rule display name                |
| description | TEXT    |                             | Rule description                 |
| type        | TEXT    | NOT NULL                    | RuleType enum                    |
| config      | TEXT    | NOT NULL, JSON              | RuleConfig                       |
| enabled     | INTEGER | DEFAULT 1                   | Boolean                          |
| priority    | INTEGER | DEFAULT 100                 | Override priority                |
| conditions  | TEXT    | JSON array                  | Optional RuleCondition[]         |
| source      | TEXT    | DEFAULT 'user'              | 'gm'                             | 'plugin' | 'system' | 'user' |
| plugin_id   | TEXT    |                             | Plugin that registered this rule |
| created_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP   |                                  |
| updated_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP   |                                  |

**Indexes:** `(world_id)`, `(chat_id)`, `(location_id)`, `(enabled)`

### Rule Resolution Pipeline

```
1. Action or check occurs (LLM declares intent or player acts)
2. Engine gathers applicable rules:
   a. Active Location rules (actor's current location)
   b. Active Chat/Group Chat rules
   c. Active World rules
3. For each scope, filter by priority, pick highest
4. Check conditions (if any) — skip rules whose conditions aren't met
5. Apply selected rule's config to the action
6. If multiple rules from different scopes apply:
   - Location modifies first, then Chat, then World
   - Or: Location fully overrides if rule config has `override: true`
7. Log which rules were applied (for prompt injection)
```

### Prompt Injection of Active Rules

Active rules are injected into the LLM prompt as a structured section:

```
[Active Rules]
- No Magic Zone (Location): All spellcasting is prohibited. Active: 3 turns.
- Double Fire Damage (World): Fire damage dealt and received is doubled.
- Stealth Advantage (Location): Stealth checks have advantage in the dark forest.
```

This gives the LLM full awareness of what rules are in effect so it can
narrate accordingly.

### LLM Game Master Rule Management

The LLM Game Master can create, modify, or remove rules via structured
intent blocks (same pattern as combat intent):

```typescript
interface RuleIntent {
  action: "create" | "modify" | "remove" | "toggle";
  rule: {
    name: string;
    description: string;
    scope: "world" | "chat" | "location";
    scopeId?: string; // world_id, chat_id, or location_id
    type: RuleType;
    config: RuleConfig;
    priority?: number;
    conditions?: RuleCondition[];
  };
  narrative: string; // In-character justification
}
```

Example LLM output:

```
The ancient wards flare to life as you cross the threshold.

[RULE_INTENT]
{
  "action": "create",
  "rule": {
    "name": "Anti-Magic Barrier",
    "description": "Ancient wards suppress all magic in the throne room",
    "scope": "location",
    "scopeId": "loc_throne_room",
    "type": "action_prohibition",
    "config": {
      "prohibitedActions": ["cast"]
    },
    "priority": 500
  },
  "narrative": "The air crackles with power. You feel your magical energy
   drain away — this place is warded against sorcery."
}
[/RULE_INTENT]
```

The engine validates the intent, applies the rule, and injects the result
into the prompt:

```
[RULE APPLIED]
Anti-Magic Barrier activated in Throne Room. Spellcasting prohibited.
[/RULE APPLIED]
```

---

## Plugin RPG Engine

### Philosophy: Fixed CPU Cost, LLM Orchestrated

The RPG engine is **plugin-based**. Each mechanic (dice rolling, combat
resolution, skill checks, loot generation, status effects) is a deterministic
**fixed CPU cost function** — not an LLM call. The LLM orchestrates which
functions to call; the engine executes them fast and reports results.

This separation means:

- **LLM does what it's good at**: narrative, intent, difficulty judgement,
  creative descriptions
- **Engine does what it's good at**: math, state transitions, validation,
  deterministic resolution
- **Plugins extend what the engine can do**: new RPG systems, custom dice,
  bespoke combat formulae — all without changing core code

### Plugin RPG Engine Interface

```typescript
interface RpgMechanicPlugin {
  name: string; // Unique plugin name
  version: string;
  description: string;

  // Lifecycle hooks
  onActivate?(context: RpgContext): Promise<void>;
  onDeactivate?(): Promise<void>;

  // Fixed CPU cost functions (registered mechanics)
  resolvers: MechanicResolver[];
}

interface RpgContext {
  db: Database;
  eventBus: EventBus;
  logger: Logger;
  registerResolver: (resolver: MechanicResolver) => void;
  getStatBlock: (actorId: string) => Promise<StatBlock>;
  getEffectiveStats: (actorId: string) => Promise<StatBlock>;
  getActiveRules: (worldId: string, chatId: string, locationId?: string) => Promise<ChatRule[]>;
}

interface MechanicResolver {
  name: string; // e.g. 'dice_roll', 'combat_resolve', 'skill_check'
  description: string;
  parameters: JSONSchema; // Input schema
  execute: (params: any) => Promise<ResolverResult>; // Deterministic, fast
}

interface ResolverResult {
  success: boolean;
  data: Record<string, unknown>; // Mechanical result
  narrative?: string; // Optional neutral description
  stateChanges?: StateChange[]; // State mutations to apply
  appliedRules?: string[]; // Rules that affected this resolution
}
```

### Built-in Core Resolvers

These are shipped as built-in plugins (always available):

| Resolver        | Input                                  | Output                      | CPU Cost   |
| --------------- | -------------------------------------- | --------------------------- | ---------- |
| `dice_roll`     | notation, reason                       | total, rolls[], modifier    | O(1)       |
| `skill_check`   | skill, dc, statBlock, modifiers        | success, roll, margin       | O(1)       |
| `combat_attack` | attackerStats, defenderStats, weapon   | hit, damage, crit           | O(1)       |
| `damage_apply`  | damage, damageType, resistances, armor | netDamage, statusEffects[]  | O(1)       |
| `loot_generate` | lootTable, rolls                       | items[]                     | O(n)       |
| `status_apply`  | effect, targetStats, duration          | appliedEffect, tickSchedule | O(1)       |
| `level_up`      | currentStats, chosenAttribute          | newStats, newAbilities      | O(1)       |
| `initiative`    | actors[]                               | orderedQueue                | O(n log n) |
| `xp_calculate`  | source, difficulty, actorLevel         | xpAwarded                   | O(1)       |

### Plugin Registration

```typescript
// Example: custom D&D 5e combat resolver plugin
const dndCombatPlugin: RpgMechanicPlugin = {
  name: "dnd-5e-combat",
  version: "1.0.0",
  description: "D&D 5e combat resolution with advantage/disadvantage, crits, and damage types",

  resolvers: [
    {
      name: "dnd_attack_roll",
      description: "D&D 5e attack roll with advantage/disadvantage support",
      parameters: {
        type: "object",
        properties: {
          attackBonus: { type: "number" },
          targetAc: { type: "number" },
          advantage: { type: "boolean", default: false },
          disadvantage: { type: "boolean", default: false },
        },
        required: ["attackBonus", "targetAc"],
      },
      execute: async ({ attackBonus, targetAc, advantage, disadvantage }) => {
        const roll1 = rollDie(20);
        const roll2 = advantage || disadvantage ? rollDie(20) : roll1;
        const finalRoll = advantage ? Math.max(roll1, roll2) : disadvantage ? Math.min(roll1, roll2) : roll1;
        const total = finalRoll + attackBonus;
        const isCrit = finalRoll === 20;
        const isFumble = finalRoll === 1;

        return {
          success: true,
          data: {
            roll: finalRoll,
            total,
            isCrit,
            isFumble,
            hit: total >= targetAc || isCrit,
            advantage: advantage ? { roll1, roll2, used: Math.max } : undefined,
            disadvantage: disadvantage ? { roll1, roll2, used: Math.min } : undefined,
          },
        };
      },
    },
  ],
};
```

### LLM ↔ Resolver Flow

```
1. LLM generates narrative + structured mechanic intent
2. Engine extracts intent (e.g., [COMBAT_INTENT], [SKILL_CHECK])
3. Engine calls the appropriate resolver plugin:
   - Look up resolver by name from plugin registry
   - Validate parameters against JSON schema
   - Execute resolver (fixed CPU cost, sub-millisecond)
4. Engine applies state changes from resolver result
5. Engine feeds mechanical result back to LLM
6. LLM narrates the mechanical truth
```

### Resolver Chaining (Composability)

Resolvers can be chained for complex mechanics:

```typescript
// Example: full attack resolution chain
const attackChain = [
  { resolver: "dnd_attack_roll", params: { attackBonus, targetAc } },
  { resolver: "damage_roll", params: { weaponDamage, strModifier } },
  { resolver: "damage_apply", params: { damage, resistances, armor } },
  { resolver: "status_apply", params: { effect: "bleeding", target } },
];

// Each resolver's output is available as input to the next
// Chain stops if any resolver returns success: false
```

### Custom Resolver Registration (Community Plugins)

Third-party plugins can register new resolvers for any RPG system:

| System          | Resolver Example   | Use Case                              |
| --------------- | ------------------ | ------------------------------------- |
| Call of Cthulhu | `d100_skill_check` | D100 roll-under, pushes, luck spends  |
| Cyberpunk RED   | `netrun_resolve`   | NET architecture, black ICE, programs |
| Pathfinder 2e   | `pf2e_degrees`     | Critical success/failure by +/-10     |
| GURPS           | `gurps_3d6_roll`   | 3d6 roll-under, margin of success     |
| FATE            | `fate_4df`         | 4dF dice, aspect invocations          |
| Custom          | `custom_dice_pool` | Any dice pool system (Shadowrun, WoD) |

### Performance Characteristics

| Metric                  | Target   | Notes                           |
| ----------------------- | -------- | ------------------------------- |
| Per-resolver latency    | < 1ms    | No LLM calls, pure math         |
| Memory per resolver     | < 64KB   | No state retained between calls |
| Resolver chain (5 deep) | < 5ms    | Sequential, no IO               |
| Concurrent resolutions  | 1000/sec | Stateless, thread-safe          |

### Plugin RPG Engine vs. Prompt-Based Mechanics

| Approach                 | CPU Cost            | Determinism      | Flexibility    | LLM Load |
| ------------------------ | ------------------- | ---------------- | -------------- | -------- |
| **Plugin resolver**      | Fixed, O(1)         | ✅ Deterministic | Plugin-defined | None     |
| **LLM-prompted**         | Variable, expensive | ❌ Hallucinates  | Infinite       | High     |
| **Hybrid (this system)** | Fixed + narrative   | ✅ Validated     | Plugin + LLM   | Low      |

The hybrid approach ensures the LLM never directly mutates game state.
Plugin resolvers provide the mechanical backbone; the LLM provides the
narrative skin.

### Plugin Bundle Presets

Plugin bundles are **pre-configured groups of RPG mechanic plugins** that
activate together as a cohesive ruleset. A bundle defines which resolvers,
stat templates, skill lists, and default chat rules compose a complete game
system.

```typescript
interface PluginBundle {
  name: string; // e.g. 'dnd-5e', 'call-of-cthulhu', 'fate-core'
  version: string;
  description: string;
  author: string;

  // Plugin dependencies (loaded automatically)
  plugins: string[]; // e.g. ['dice-roller', 'dnd-5e-combat', 'dnd-5e-skills']

  // Stat template (default stat block for new characters in this system)
  defaultStatBlock: Partial<StatBlock>;

  // Skill definitions for this system
  skills: SkillDefinition[];

  // Default chat rules (activated when bundle is enabled for a world/chat)
  defaultRules: Partial<ChatRule>[];

  // Level curve
  levelProgression: {
    xpFormula: string; // 'currentLevel * 100 + 50'
    attributesPerLevel: number; // Every N levels, +1 attribute
    hpPerLevel: number; // Fixed HP gain per level
    mpPerLevel: number; // Fixed MP gain per level
  };

  // Default loot tables
  lootTables: Record<string, LootTable>;
}
```

#### Built-In Bundles

| Bundle            | Plugins                                                  | Stat Range         | Dice | Best For                       |
| ----------------- | -------------------------------------------------------- | ------------------ | ---- | ------------------------------ |
| `dnd-5e`          | dice-roller, dnd-combat, dnd-skills, dnd-magic, dnd-loot | 1-30               | d20  | Fantasy, tactical combat       |
| `call-of-cthulhu` | coc-dice, coc-skills, coc-sanity, coc-loot               | 1-100 (percentile) | d100 | Horror, investigation          |
| `fate-core`       | fate-dice, fate-aspects, fate-stunts                     | 0-8 (ladder)       | 4dF  | Narrative, cinematic           |
| `gurps-lite`      | gurps-dice, gurps-skills, gurps-damage                   | 1-20 (3d6 curve)   | 3d6  | Simulationist, detailed        |
| `minimal`         | dice-roller                                              | 1-20               | d20  | Light RP, no crunch            |
| `none`            | (empty)                                                  | —                  | —    | Pure narrative, zero mechanics |

#### Bundle Activation Scopes

Bundles are activated per scope — same cascade as chat rules:

```
World level:  bundle = 'dnd-5e'     → All chats in this world use D&D rules
Chat level:   bundle = 'fate-core'  → This chat overrides world with FATE
Location:     bundle = 'minimal'    → This location uses light rules
```

A scope can have **exactly one active bundle**. Switching bundles migrates
state if possible (same stat names), or resets to defaults (new stat system).

### Fine Tuning Per Scope

Once a bundle is active, its behavior can be **fine-tuned** per scope
without modifying the bundle itself. Fine-tuning overlays sit on top of the
bundle defaults:

```typescript
interface MechanicFineTune {
  scope: "world" | "chat" | "location";
  scopeId: string;

  // Stat adjustments (overrides bundle defaults)
  statRanges?: {
    min?: number; // Default 1
    max?: number; // Default 30
    startingPoints?: number; // Point-buy total for new characters
  };

  // Skill overrides
  enabledSkills?: string[]; // If set, only these skills are active
  customSkills?: SkillDefinition[]; // Additional skills not in bundle

  // Difficulty curve
  difficultyMultiplier?: number; // 0.5 = easier, 2.0 = harder, applied to all DCs
  xpMultiplier?: number; // 0.5 = slow leveling, 2.0 = fast

  // Rule overrides
  ruleBlacklist?: string[]; // Rule IDs to disable
  rulePriorityOverrides?: Record<string, number>; // Override priority for specific rules

  // Plugin-specific
  pluginConfigs?: Record<string, Record<string, unknown>>;
}
```

#### Fine-Tuning UI (Web)

```
┌─ World: "Forgotten Realm" ────────────────────────────────────┐
│ Bundle: [D&D 5e ▼]                                            │
│                                                               │
│ Stat Range:  1 ──────●──────30     Starting Points: [27  ]    │
│ Difficulty:  [0.5 ●────────── 2.0]  XP Rate: [1.0 ●──── 2.0] │
│                                                               │
│ Active Skills: [✔ Athletics] [✔ Acrobatics] [✘ Animal Handle] │
│               [✔ Arcana]     [✔ Stealth]                      │
│                                                               │
│ Custom Skills: [+ Add]                                        │
│ ┌─ "Jedi Lore" ──────────────────────────────────────────┐    │
│ │ Stat: INT    | Base DC: 15 | Description: ...          │    │
│ └─────────────────────────────────────────────────────────┘    │
│                                                               │
│ ┌─ Chat: "Campaign 1" ──── Override ──────────────────────┐   │
│ │ Bundle: [D&D 5e ▼]  (inherited from world)               │   │
│ │ Difficulty: [1.0] (custom override)                      │   │
│ └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

#### Fine-Tuning via LLM GM

The LLM GM can fine-tune mechanics through structured intent:

```typescript
interface FineTuneIntent {
  action:
    "adjust_difficulty" | "toggle_skill" | "set_stat_range" | "add_custom_skill" | "override_rule_priority";
  scope: "world" | "chat" | "location";
  scopeId: string;
  config: MechanicFineTune;
  narrative: string; // In-character justification
}
```

Example:

```
The ancient dragon's lair warps reality itself.
[FINE_TUNE_INTENT]
{
  "action": "adjust_difficulty",
  "scope": "location",
  "scopeId": "loc_dragon_lair",
  "config": {
    "difficultyMultiplier": 2.0,
    "rulePriorityOverrides": {
      "fire_resistance": 1000
    }
  },
  "narrative": "The heat is unbearable. Fire clings to everything.
   Your resistance is barely enough to survive."
}
[/FINE_TUNE_INTENT]
```

#### Preset Sharing & Marketplace

Bundle presets are shareable as `.rpgbundle` files (JSON):

```json
{
  "spec": "rpg-bundle-v1",
  "name": "star-wars-5e",
  "version": "1.2.0",
  "base": "dnd-5e",
  "overrides": {
    "skills": [
      { "name": "Piloting", "stat": "dex", "baseDC": 12 },
      { "name": "Jedi Lore", "stat": "int", "baseDC": 15 }
    ],
    "statRanges": { "min": 3, "max": 20, "startingPoints": 30 },
    "customRules": [
      {
        "name": "Lightsaber Parry",
        "type": "stat_modifier",
        "config": { "stat": "ac", "modifier": 2 },
        "condition": { "type": "has_item", "value": "lightsaber" }
      }
    ]
  }
}
```

These can be shared between users or downloaded from a community registry.

### Plugin RPG Engine Integration with Rules System

Chat rules (defined in the Rules System section above) and plugin bundles
work together:

1. **Bundle defines** the default resolver set, stat model, and skills
2. **Chat rules** modify behavior at runtime (without changing bundle)
3. **Fine-tuning** adjusts numeric parameters per scope
4. **Rules cascade** applies on top of bundle defaults

```
Bundle: dnd-5e
  → Skills: Athletics, Arcana, Stealth, Perception...
  → Resolvers: dnd_attack_roll, damage_roll, dnd_skill_check...
  → Default DCs: 10 (Easy), 15 (Medium), 20 (Hard)

Fine-tune (World): XP rate = 2.0 (fast leveling)
Fine-tune (Chat): difficulty = 0.8 (easier rolls)

Chat Rule (Location): "No Magic Zone" → prohibits 'cast' actions
  → Applied on top of bundle + fine-tune
  → Resolver: dnd_attack_roll still works (melee)
  → Resolver: dnd_spell_resolve blocked by rule

Result: Fast-leveling, slightly easier D&D with a no-magic location.
```

---

## Prompt Assembly (RPG-Enhanced)

### Full Prompt Structure with RPG State

```
[System]
You are {{char}}. {{system_prompt}}
When describing actions that have uncertain outcomes, output a
[COMBAT_INTENT] or [SKILL_CHECK] block alongside your narrative.

[Character Card — {{char}}]
Description: {{character.description}}
Personality: {{character.personality}}
Scenario: {{character.scenario}}

[Character Stats — {{char}}]
Level {{level}} {{race}} {{class}}
HP: {{hp}}/{{maxHp}} | MP: {{mp}}/{{maxMp}}
{{statBlock}}
AC: {{ac}} | Initiative: {{initiative}}
XP: {{xp}}/{{xpToNext}}
{{statusEffects}}

[Equipment — {{char}}]
{{equippedItems with stat bonuses}}

[Inventory — {{char}}]
{{inventoryList with quantities and weights}}
Gold: {{gold}}
Weight: {{currentWeight}}/{{capacity}} lbs

[User Persona — {{user}}]
Name: {{persona.name}}
Description: {{persona.description}}
{{personaStats if persona has stats}}

[Active Quests]
{{activeQuestsWithProgress}}

[Lorebook (before char)]
{{activatedLoreEntries}}

[Example Messages]
{{mes_example}}

[Chat History]
{{recentMessages}}

[Lorebook (after char)]
{{activatedLoreEntriesAfter}}

[Post-History Instructions]
{{post_history_instructions}}
```

### Combat Intent Extraction

The LLM outputs structured blocks within narrative text:

```
The goblin swings wildly at you. You duck under its blade and
counter with a swift thrust.

[COMBAT_INTENT]
{
  "action": "attack",
  "target": "goblin_01",
  "weapon": "longsword_001",
  "description": "Counter-attack after dodging"
}
[/COMBAT_INTENT]
```

The engine extracts `[COMBAT_INTENT]...[/COMBAT_INTENT]` blocks, resolves
mechanically, and feeds the result back:

```
[COMBAT_RESULT]
{
  "hit": true,
  "damage": 8,
  "targetHp": "4/12",
  "statusEffects": [],
  "defeated": false
}
[/COMBAT_RESULT]
```

The LLM then narrates the mechanical truth.

---

## Implementation Roadmap

### Phase 1: Foundation (Current → v0.1)

| Task                                  | Files                                           | Status      |
| ------------------------------------- | ----------------------------------------------- | ----------- |
| `actor_items` table + migration       | `src/db/schema-actors.ts`, `src/db/migrations/` | Not started |
| Equipment slots on `actor_items`      | Schema + `src/characters/equipment.ts`          | Not started |
| Basic stat block on `actors.settings` | Schema update                                   | Not started |
| Stat computation (base + equipment)   | `src/rpg/stat-computer.ts`                      | Not started |
| Equip/unequip service                 | `src/rpg/equipment.ts`                          | Not started |

### Phase 2: Dice & Combat (v0.2)

| Task                          | Files                            | Status      |
| ----------------------------- | -------------------------------- | ----------- |
| Dice engine (parser + roller) | `src/rpg/dice.ts`                | Not started |
| Pre-seeded dice queue         | `src/rpg/dice-queue.ts`          | Not started |
| Combat intent extraction      | `src/rpg/combat-intent.ts`       | Not started |
| Combat resolution pipeline    | `src/rpg/combat-resolver.ts`     | Not started |
| Status effect system          | `src/rpg/status-effects.ts`      | Not started |
| Event extraction upgrade      | `src/story/events/extraction.ts` | Not started |

### Phase 3: Skills & XP (v0.3)

| Task                             | Files                     | Status      |
| -------------------------------- | ------------------------- | ----------- |
| Skill definitions                | `src/rpg/skills.ts`       | Not started |
| Skill check resolution           | `src/rpg/skill-checks.ts` | Not started |
| XP tracking on world actor state | Schema + `src/rpg/xp.ts`  | Not started |
| Level-up logic                   | `src/rpg/leveling.ts`     | Not started |
| Loot table system                | `src/rpg/loot.ts`         | Not started |

### Phase 4: Persona-World (v0.4)

| Task                           | Files                          | Status      |
| ------------------------------ | ------------------------------ | ----------- |
| Persona world traits           | `src/personas/world-traits.ts` | Not started |
| Persona ↔ character conversion | `src/personas/conversion.ts`   | Not started |
| RPG-enhanced prompt assembly   | `src/rpg/prompt-assembly.ts`   | Not started |
| Currency system                | `src/rpg/currency.ts`          | Not started |

### Phase 5: Chat Rules & Scoped Mechanics (v0.5)

| Task                                     | Files                                          | Status      |
| ---------------------------------------- | ---------------------------------------------- | ----------- |
| `chat_rules` table + migration           | `src/db/schema-rules.ts`, `src/db/migrations/` | Not started |
| Chat rule CRUD service                   | `src/rpg/rules-service.ts`                     | Not started |
| Rule resolution pipeline (scope cascade) | `src/rpg/rules-resolver.ts`                    | Not started |
| Rule intent extraction from LLM          | `src/rpg/rules-intent.ts`                      | Not started |
| Rule prompt injection                    | `src/rpg/rules-prompt.ts`                      | Not started |
| Location-scoped rule activation          | `src/rpg/rules-location.ts`                    | Not started |

### Phase 6: Plugin Engine & Bundles (v0.6)

| Task                                                  | Files                         | Status      |
| ----------------------------------------------------- | ----------------------------- | ----------- |
| `RpgMechanicPlugin` interface + registry              | `src/rpg/plugin-engine.ts`    | Not started |
| Built-in core resolvers (dice, skill, combat, damage) | `src/rpg/resolvers/`          | Not started |
| Resolver chain execution                              | `src/rpg/resolver-chain.ts`   | Not started |
| Plugin bundle system (`PluginBundle` manifest)        | `src/rpg/bundle-loader.ts`    | Not started |
| Fine-tune overlay service                             | `src/rpg/fine-tune.ts`        | Not started |
| Bundle activation per scope (world/chat/location)     | `src/rpg/bundle-activator.ts` | Not started |
| `.rpgbundle` import/export                            | `src/rpg/bundle-io.ts`        | Not started |
| LLM GM fine-tune intent extraction                    | `src/rpg/fine-tune-intent.ts` | Not started |

---

## Reference

### Related Documents

| Document                  | Covers                                     |
| ------------------------- | ------------------------------------------ |
| `docs/character-setup.md` | Character card system, format support      |
| `docs/actors.md`          | Actor data model, item tables              |
| `docs/schema.md`          | Database schema                            |
| `docs/story/`             | Story system, quests, events               |
| `docs/memory-system.md`   | Character memories                         |
| `docs/plugin-system.md`   | Plugin architecture, tool/role definitions |
| `docs/assets.md`          | Asset upload and linking pipeline          |

### External References

| System                 | Relevance                                    |
| ---------------------- | -------------------------------------------- |
| D&D 5e SRD             | Stat system, combat resolution, skill checks |
| Multihog DnD Framework | Dual-model state tracking, hybrid RNG        |
| Horae (SillyTavern)    | Modular RPG, equipment slots, status bars    |
| Waypoint               | "LLM proposes, code disposés" architecture   |
| OpenDungeon            | TypeScript mechanics + LLM narrative         |
