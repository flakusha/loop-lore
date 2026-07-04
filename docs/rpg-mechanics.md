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
are world-scoped. The character card defines who they *are*; the world state
defines what they *have* and what they *can do*.

---

## Stat System

### Core Attributes

Six attributes form the foundation. Every character has base values (from
the character card or default template):

| Abbrev | Full Name     | Governs                           |
| ------ | ------------- | --------------------------------- |
| STR    | Strength      | Melee damage, carry weight, force |
| DEX    | Dexterity     | Ranged attacks, evasion, speed    |
| CON    | Constitution  | HP, resistances, endurance        |
| INT    | Intelligence  | Arcane power, skill learning      |
| WIS    | Wisdom        | Perception, willpower, healing    |
| CHA    | Charisma      | Persuasion, barter, leadership    |

### Stat Block Interface

```typescript
interface StatBlock {
  // Base attributes (from character card or world default)
  str: number;  // 1–30, default 10
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;

  // Derived stats (computed, not stored)
  maxHp: number;    // = con * 5 + level * 2
  hp: number;       // current, mutable
  maxMp: number;    // = int * 3 + wis * 2
  mp: number;       // current, mutable
  initiative: number; // = dex + random(1,20)
  armorClass: number; // = 10 + dex modifier + armor bonus
  carryCapacity: number; // = str * 10 (lbs)
  level: number;    // 1–20
  xp: number;       // current XP
  xpToNext: number; // computed from level
}
```

### Stat Modifiers

Attributes produce modifiers (like D&D 5e):

```
modifier = floor((stat - 10) / 2)
```

| Stat | 1  | 8  | 10 | 12 | 16 | 20 | 30 |
| ---- | -- | -- | -- | -- | -- | -- | -- |
| Mod  | -5 | -1 | 0  | +1 | +3 | +5 | +10 |

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
  category: ItemCategory;    // weapon, armor, consumable, key_item, etc.
  rarity: ItemRarity;        // common → unique
  stackable: boolean;
  maxStack: number;
  properties: ItemProperties; // type-specific data
  value: number;              // gold value
  weight: number;             // encumbrance
}

// Type-specific properties
interface WeaponProperties {
  damageDice: string;         // "2d6", "1d8+3"
  damageType: string;         // "slashing", "piercing", "fire"
  range: number;              // feet
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
  type: 'heal' | 'buff' | 'debuff' | 'teleport' | 'summon' | 'custom';
  stat?: keyof StatBlock;
  value?: number;
  duration?: number;   // turns, or -1 for permanent
  description: string;
}
```

### Tier 2: World Item Instances

Items placed in the world — on the ground, in containers, carried by NPCs.
Already implemented in `src/story/items.ts`.

```typescript
interface WorldItem {
  id: string;            // world_items.id
  itemId: string;        // → item definitions
  worldId: string;
  locationId?: string;   // where in the world
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
  gold: number;           // convenience — also an item, but fast-access
  weight: number;         // computed: sum of item weights
  capacity: number;       // computed: str * 10
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
  head: string | null;     // world_item_id
  chest: string | null;
  legs: string | null;
  feet: string | null;
  hands: string | null;    // gloves/shields
  mainHand: string | null; // weapon
  offHand: string | null;  // shield/weapon/torch
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

| Notation | Meaning |
| -------- | ------- |
| `d4`     | 1 four-sided die |
| `d6`     | 1 six-sided die |
| `d8`     | 1 eight-sided die |
| `d10`    | 1 ten-sided die |
| `d12`    | 1 twelve-sided die |
| `d20`    | 1 twenty-sided die |
| `2d6`    | 2 six-sided dice, sum |
| `1d8+3`  | 1 eight-sided die + 3 |

### Dice Parser

```typescript
function rollDice(notation: string): { total: number; rolls: number[]; modifier: number }
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
writes what happens; the engine determines what's *true*.

### Combat Intent (Structured Output)

When combat begins, the LLM outputs structured intent alongside narrative:

```typescript
interface CombatIntent {
  action: 'attack' | 'defend' | 'cast' | 'flee' | 'use_item' | 'grapple' | 'help';
  target?: string;        // actor_id of target
  weapon?: string;        // world_item_id of weapon used
  spell?: string;         // spell name if casting
  item?: string;          // world_item_id if using item
  description: string;    // narrative text (what the LLM writes)
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

| Effect     | Mechanic                                      | Duration     |
| ---------- | --------------------------------------------- | ------------ |
| Poisoned   | -2 to all rolls, 1d4 damage per turn          | 1d4 turns    |
| Stunned    | Cannot act, auto-fail DEX saves               | 1 turn       |
| Blessed    | +2 to all rolls                               | 1d4 turns    |
| Cursed     | -2 to all rolls, cannot heal naturally        | Until removed |
| Burning    | 1d6 damage per turn, -2 DEX                   | 1d4 turns    |
| Frozen     | Speed halved, -4 DEX                          | 1d4 turns    |
| Haste      | +2 DEX, extra action per turn                 | 1d4 turns    |
| Weakened   | -4 STR                                        | 1d4 turns    |
| Shielded   | +3 AC                                         | Until hit    |
| Invisible  | Advantage on stealth, auto-hit first attack   | 1 minute     |

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

| Skill        | Primary Stat | Use Case                        |
| ------------ | ------------ | ------------------------------- |
| Athletics    | STR          | Climbing, swimming, jumping     |
| Acrobatics   | DEX          | Balancing, tumbling, dodging    |
| Stealth      | DEX          | Hiding, sneaking, lockpicking   |
| Perception   | WIS          | Spotting, listening, noticing   |
| Arcana       | INT          | Magic knowledge, spell analysis |
| Investigation| INT          | Searching, deducing, analyzing  |
| Medicine     | WIS          | Healing, diagnosing, surgery    |
| Survival     | WIS          | Tracking, foraging, shelter     |
| Persuasion   | CHA          | Negotiating, inspiring, lying   |
| Intimidation | CHA          | Threatening, commanding         |
| Animal Handling | WIS       | Taming, riding, calming         |
| History      | INT          | Recall lore, ancient knowledge  |

### Difficulty Classes

| DC    | Label       | Example                          |
| ----- | ----------- | -------------------------------- |
| 5     | Trivial     | Open an unlocked door            |
| 10    | Easy        | Climb a rope                     |
| 15    | Medium      | Pick a locked chest              |
| 20    | Hard        | Lie to a master detective        |
| 25    | Very Hard   | Sneak past a dragon              |
| 30    | Nearly Impossible | Disguise as the king       |

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

| Source           | XP     | Notes                          |
| ---------------- | ------ | ------------------------------ |
| Quest complete   | 100-500| Scales with quest difficulty    |
| Combat (defeat)  | 25-200 | Scales with enemy level         |
| Discovery        | 10-50  | Finding secrets, new locations  |
| Social (success) | 10-30  | Persuasion, negotiation         |
| Creative solve   | 20-100 | GM/DM awards for clever plays   |

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
  category: 'currency';
  properties: {
    denomination: 'copper' | 'silver' | 'gold' | 'platinum';
    exchangeRate: number; // relative to gold: copper=0.01, silver=0.1, gold=1, platinum=10
  };
}
```

### Exchange Rates

| Currency  | To Gold |
| --------- | ------- |
| Copper    | 0.01    |
| Silver    | 0.10    |
| Gold      | 1.00    |
| Platinum  | 10.00   |

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
  rolls: number;  // how many times to roll on the table
}

interface LootEntry {
  itemId: string;
  weight: number;  // relative probability
  minQuantity: number;
  maxQuantity: number;
  chance: number;  // 0-1, independent chance per entry
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
  trait: string;        // "Outsider", "Native", "Chosen One", etc.
  description: string;  // Narrative justification
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

| Task | Files | Status |
| ---- | ----- | ------ |
| `actor_items` table + migration | `src/db/schema-actors.ts`, `src/db/migrations/` | Not started |
| Equipment slots on `actor_items` | Schema + `src/characters/equipment.ts` | Not started |
| Basic stat block on `actors.settings` | Schema update | Not started |
| Stat computation (base + equipment) | `src/rpg/stat-computer.ts` | Not started |
| Equip/unequip service | `src/rpg/equipment.ts` | Not started |

### Phase 2: Dice & Combat (v0.2)

| Task | Files | Status |
| ---- | ----- | ------ |
| Dice engine (parser + roller) | `src/rpg/dice.ts` | Not started |
| Pre-seeded dice queue | `src/rpg/dice-queue.ts` | Not started |
| Combat intent extraction | `src/rpg/combat-intent.ts` | Not started |
| Combat resolution pipeline | `src/rpg/combat-resolver.ts` | Not started |
| Status effect system | `src/rpg/status-effects.ts` | Not started |
| Event extraction upgrade | `src/story/events/extraction.ts` | Not started |

### Phase 3: Skills & XP (v0.3)

| Task | Files | Status |
| ---- | ----- | ------ |
| Skill definitions | `src/rpg/skills.ts` | Not started |
| Skill check resolution | `src/rpg/skill-checks.ts` | Not started |
| XP tracking on world actor state | Schema + `src/rpg/xp.ts` | Not started |
| Level-up logic | `src/rpg/leveling.ts` | Not started |
| Loot table system | `src/rpg/loot.ts` | Not started |

### Phase 4: Persona-World (v0.4)

| Task | Files | Status |
| ---- | ----- | ------ |
| Persona world traits | `src/personas/world-traits.ts` | Not started |
| Persona ↔ character conversion | `src/personas/conversion.ts` | Not started |
| RPG-enhanced prompt assembly | `src/rpg/prompt-assembly.ts` | Not started |
| Currency system | `src/rpg/currency.ts` | Not started |

---

## Reference

### Related Documents

| Document | Covers |
| -------- | ------ |
| `docs/character-setup.md` | Character card system, format support |
| `docs/actors.md` | Actor data model, item tables |
| `docs/schema.md` | Database schema |
| `docs/story/` | Story system, quests, events |
| `docs/memory-system.md` | Character memories |

### External References

| System | Relevance |
| ------ | --------- |
| D&D 5e SRD | Stat system, combat resolution, skill checks |
| Multihog DnD Framework | Dual-model state tracking, hybrid RNG |
| Horae (SillyTavern) | Modular RPG, equipment slots, status bars |
| Waypoint | "LLM proposes, code disposés" architecture |
| OpenDungeon | TypeScript mechanics + LLM narrative |
