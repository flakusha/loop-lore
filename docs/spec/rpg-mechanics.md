> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# RPG Mechanics Specification

> ⚠️ **Status:** NOT IMPLEMENTED. No dice engine, no stat system, no combat, no
> XP. No `src/dice/` or `src/rpg/` directory exists. Difficulty columns exist on
> `worlds` table but no code reads or enforces them. This spec is entirely
> aspirational. See [`docs/meta/plan.md`](../meta/plan.md) "Skipped During
> Implementation" section.

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

---

> 🚀 **Post-MVP (v0.2+):** Dual-state model, stat blocks, items, combat, skills,
> XP, currency, loot.

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
Actors (static) → one-to-many → WorldActorState (dynamic, per world)
  WorldActorState contains: stats, inventory, equipment, status_effects, relationships, knowledge
```

**Why this matters:** The same character can be a powerful mage in one world and
a helpless villager in another. Their stats, inventory, and relationships are
world-scoped. The character card defines who they _are_; the world state defines
what they _have_ and what they _can do_.

---

## Stat System

### Core Attributes

Six attributes form the foundation. Every character has base values (from the
character card or default template):

| Abbrev | Full Name    | Governs                           |
| ------ | ------------ | --------------------------------- |
| STR    | Strength     | Melee damage, carry weight, force |
| DEX    | Dexterity    | Ranged attacks, evasion, speed    |
| CON    | Constitution | HP, resistances, endurance        |
| INT    | Intelligence | Arcane power, skill learning      |
| WIS    | Wisdom       | Perception, willpower, healing    |
| CHA    | Charisma     | Persuasion, barter, leadership    |

### Stat Block Interface

### Stat Modifiers

Attributes produce modifiers (like D&D 5e):

```
modifier = floor((stat - 10) / 2)
```

| Stat | 1  | 8  | 10 | 12 | 16 | 20 | 30  |
| ---- | -- | -- | -- | -- | -- | -- | --- |
| Mod  | -5 | -1 | 0  | +1 | +3 | +5 | +10 |

### Effective Stats (Computed at Use Time)

When the engine needs a stat value, it computes the **effective stat**:

```
effectiveStat = baseStat + equipmentBonus + statusEffectModifier + worldModifier
```

Equipment and status effects never modify the stored base stat — they're applied
as layered modifiers at computation time. This means:

- Unequipping an item instantly removes its bonus
- A "poisoned" debuff applies in real-time
- The base stat always reflects the character's intrinsic ability

---

---

> 🚀 **Post-MVP:** Full items/equipment/combat/skills system.

## Item System (Three-Tier)

### Tier 1: Item Definitions (Templates)

World-scoped templates. Reusable. Defined once, instanced many times.

### Tier 2: World Item Instances

Items placed in the world — on the ground, in containers, carried by NPCs.
Already implemented in `src/story/items.ts`.

### Tier 3: Actor Inventory + Equipment

Items carried by an actor (user character, NPC, or impersonated persona).
Extends the existing `world_items` with equipment state.

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
function rollDice(notation: string,): { total: number; rolls: number[]; modifier: number };
```

### Pre-Seeded Dice Queue (Deterministic Mode)

For sequential combat where fairness matters, the engine pre-generates a queue
of dice rolls before the LLM writes the narrative. The LLM narrates around
pre-determined outcomes:

```
Before turn:
  diceQueue = [14, 7, 18, 3, 11, ...]  // pre-generated

LLM prompt includes:
  "The goblin attacks. (SYSTEM: attack roll = 14, AC = 13, HIT)"

LLM narrates:
  "The goblin swings its rusty blade, catching you across the arm..."
```

### Tool-Call Dice (Narrative Mode)

For skill checks where the LLM should declare difficulty before seeing the
result (prevents sycophancy):

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

Status effects are stored on the actor's world state and injected into the
prompt as a structured section:

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

| DC | Label             | Example                   |
| -- | ----------------- | ------------------------- |
| 5  | Trivial           | Open an unlocked door     |
| 10 | Easy              | Climb a rope              |
| 15 | Medium            | Pick a locked chest       |
| 20 | Hard              | Lie to a master detective |
| 25 | Very Hard         | Sneak past a dragon       |
| 30 | Nearly Impossible | Disguise as the king      |

### Skill Check Resolution

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

Currency is an item with special properties. The engine tracks gold separately
for fast access but it's still an item under the hood.

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

---

## Loot System

### Loot Tables

Each enemy type or container can have a loot table:

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

## Creation Pipeline

An integrated pipeline for creating game entities — items, NPCs, locations,
enemies — through a chain of stages. Each stage builds on the previous,
producing a complete entity in one flow.

### Pipeline Stages

```
Description → Stats → Effects → Image → Placement
```

Each stage is a step in the pipeline. Some steps are LLM-generated, some
are engine-computed, some are optional.

| Stage       | Who          | Input                      | Output                       | Required |
| ----------- | ------------ | -------------------------- | ---------------------------- | -------- |
| Description | LLM          | User prompt / GM request   | Name, lore, flavor text      | Yes      |
| Stats       | Engine + LLM | Description + world rules  | Stat block, category, rarity | Yes      |
| Effects     | Engine + LLM | Stats + world rules        | Item effects, status effects | Optional |
| Image       | LLM (image)  | Description + style prompt | Asset (avatar/thumbnail)     | Optional |
| Placement   | Engine       | Entity + target            | World item, inventory slot   | Yes      |

### Pipeline Data Model

### Stage 1: Description

The LLM generates the narrative foundation — name, lore, flavor text.
This is the creative seed that all other stages build on.

**Trigger:** GM says "Create a new weapon" or LLM emits `[CREATE_INTENT]`.

**LLM output:**

```
[CREATE_INTENT]
{
  "type": "item",
  "stage": "description",
  "input": "A sword forged from dragon bone, glowing with inner fire"
}
[/CREATE_INTENT]
```

**Engine response:**

```
[PIPELINE_STAGE_COMPLETE]
Stage: description
Result:
  name: "Dragonscale Blade"
  short: "A sword forged from dragon bone, glowing with inner fire"
  long: "This ancient blade was forged in the heart of a dying dragon. The bone
         still pulses with the creature's last breath. Those who wield it feel
         the weight of a thousand years of rage."
  category: "weapon"
  rarity: "rare"
  tags: ["dragon", "fire", "ancient", "melee"]
[/PIPELINE_STAGE_COMPLETE]
```

### Stage 2: Stats

The engine computes mechanical properties based on description and world
rules. The LLM can suggest stats, but the engine validates and adjusts.

**Engine logic:**

```
1. Load rarity → stat template (common = baseline, rare = +20-40%)
2. Load category → stat range (weapon: damage dice by rarity)
3. Apply world rules (if world has custom stat scaling)
4. If LLM suggested stats: validate against template
   - If within range: accept
   - If overpowered: cap at template max
   - If underpowered: boost to template min
5. Compute derived values (weight from category, value from rarity)
```

**Rarity stat templates:**

| Rarity    | Damage Range | AC Range | Value Multiplier | Weight Multiplier |
| --------- | ------------ | -------- | ---------------- | ----------------- |
| Common    | 1d4–1d6      | +1       | ×1.0             | ×1.0              |
| Uncommon  | 1d6–1d8      | +2       | ×2.0             | ×1.2              |
| Rare      | 1d8–1d10     | +3       | ×5.0             | ×1.5              |
| Epic      | 1d10–2d6     | +4       | ×15.0            | ×1.8              |
| Legendary | 2d6–2d8      | +5       | ×50.0            | ×2.0              |

### Stage 3: Effects

Optional stage. Adds magical effects, status effects, special abilities.
Only triggers for Uncommon+ items or when the GM/LLM explicitly requests it.

**Engine logic:**

```
1. Check rarity — Common items skip effects stage
2. Check category — weapons get onHit, armor gets onEquip, consumables get onUse
3. If LLM suggested effects: validate against rarity budget
   - Common: 0 effects
   - Uncommon: 1 effect, duration ≤ 3 turns
   - Rare: 1-2 effects, duration ≤ 5 turns
   - Epic: 2-3 effects, duration ≤ 10 turns
   - Legendary: 3+ effects, duration unlimited
4. Generate effects matching the item's theme (fire weapon → fire damage effect)
5. Compute effect values from stats (heal = CON modifier + level)
```

**Example output for Dragonscale Blade (rare):**

```
[PIPELINE_STAGE_COMPLETE]
Stage: effects
Result:
  onHit: [{ type: "debuff", stat: "con", value: -1, duration: 3,
            description: "Dragonfire sears the wound" }]
  passive: [{ type: "buff", stat: "str", value: 1,
              description: "Dragonbone grants strength" }]
  triggered: [{ condition: "on_crit", effect: {
    type: "debuff", stat: "str", value: -2, duration: 5,
    description: "Critical hit engulfs target in dragonfire"
  }}]
[/PIPELINE_STAGE_COMPLETE]
```

### Stage 4: Image

Optional stage. Generates a visual asset for the entity. Uses the image
generation system with a prompt derived from the description.

**Engine logic:**

```
1. Build image prompt from description:
   "A sword forged from dragon bone, glowing with inner fire,
    fantasy RPG item art, {world_style}, detailed, high quality"

**Style matching:**

| World Theme | Default Style   | Prompt Modifier                    |
| ----------- | --------------- | ---------------------------------- |
| Fantasy     | realistic       | "fantasy RPG, detailed, painterly" |
| Sci-fi      | realistic       | "sci-fi concept art, sleek"        |
| Anime       | anime           | "anime style, vibrant colors"      |
| Retro       | pixel_art       | "pixel art, 32x32, retro game"     |
| Horror      | sketch          | "dark sketch, pencil, eerie"       |
| Custom      | (world setting) | (user-defined)                     |

### Stage 5: Placement

The final stage. The entity is placed in the world — as a world item, in
an actor's inventory, on a shopkeeper's shelf, or as a location feature.

**Placement options by entity type:**

| Entity   | Placement Target                 | Example                            |
| -------- | -------------------------------- | ---------------------------------- |
| Item     | World item (on ground/container) | "Place in the dragon's hoard"      |
| Item     | Actor inventory                  | "Give to the party fighter"        |
| Item     | Shop inventory                   | "Add to Ironhold Smith's stock"    |
| Item     | Enemy loot table                 | "Add to dragon's loot, 25% chance" |
| NPC      | Location (spawn point)           | "Place in the throne room"         |
| NPC      | Chat (join as participant)       | "Add to group chat as merchant"    |
| Location | World (add to location graph)    | "Connect to the forest entrance"   |
| Enemy    | Location (spawn zone)            | "Spawn 3 goblins in the cave"      |

**Placement validation:**
```

### Complete Pipeline Flow

```
1. Trigger: GM says "I want a dragon bone sword" or
   LLM emits [CREATE_INTENT]

2. Stage 1 (Description): LLM generates name, lore, category, rarity

3. Stage 2 (Stats): Engine computes damage, weight, value, requirements
   - LLM may suggest, engine validates and adjusts

4. Stage 3 (Effects): Engine adds magical effects based on rarity budget
   - Skipped for Common items

5. Stage 4 (Image): Engine generates visual asset
   - Skipped if world has no image gen configured

6. Stage 5 (Placement): Engine places entity in world
   - GM specifies target, engine validates

7. Final: Engine assembles complete entity, saves to DB, records in timeline
```

### LLM Pipeline Intent

The LLM can trigger the full pipeline or individual stages:

**Full pipeline example:**

```
The merchant reaches under the counter and produces a blade that seems
to drink the light. "Dragon bone," he whispers. "Forged in the old way."

[CREATE_INTENT]
{
  "type": "item",
  "stage": "all",
  "input": "A sword forged from dragon bone, ancient, glowing with inner fire, rare quality",
  "placement": {
    "targetType": "shop",
    "targetId": "shop_ironhold_smith",
    "quantity": 1
  },
  "style": "realistic"
}
[/CREATE_INTENT]
```

### Pipeline UI (World Detail Page)

A "Create" button in the world detail page opens the creation pipeline
as a step-by-step wizard:

```
Step 1: Description
  [Name: Dragonscale Blade          ]
  [Category: Weapon ▼              ]
  [Rarity: Rare ▼                  ]
  [Description: A sword forged...   ]
  [Tags: dragon, fire, ancient      ]
  → Next

Step 2: Stats
  [Damage: 1d8+2 slashing          ]
  [Range: 5 ft                      ]
  [Weight: 4.5 lbs                  ]
  [Value: 250 gold                  ]
  [Requirements: Level 5, STR 12    ]
  → Next

Step 3: Effects
  [On Hit: -1 CON, 3 turns         ]
  [Passive: +1 STR                  ]
  [On Crit: -2 STR, 5 turns        ]
  → Next

Step 4: Image
  [Style: Realistic ▼              ]
  [Prompt: "A sword forged from dragon bone..."]
  [Generate] → [Preview] → [Accept]

Step 5: Placement
  [Target: Shop ▼ Ironhold Smith    ]
  [Quantity: 1                       ]
  [Hidden: No                        ]
  → Create

→ Entity created and placed in world.
```

### Auto-Pipeline: Loot Generation

When loot tables generate items, the pipeline runs automatically:

```
### Auto-Pipeline: NPC Creation

When the GM introduces a new NPC:
```

---

### Advanced Pipelines

Beyond items and NPCs, the pipeline pattern applies to larger-scope
creations: locations, worlds, and structured note templates. These
pipelines have more stages and more validation, but the same principle:
each stage builds on the previous, and the engine validates at every step.

---

### Location Creation Pipeline

Creates a new location within a world, including its connections,
encounter tables, and ambient assets.

```
Description → Map/Connections → Encounter Tables → Assets → Placement
```

| Stage            | Who          | Output                                                             | Required |
| ---------------- | ------------ | ------------------------------------------------------------------ | -------- |
| Description      | LLM          | Name, description, atmosphere, traits                              | Yes      |
| Map/Connections  | LLM + Engine | Connections to existing locations, travel cost, bidirectional flag | Yes      |
| Encounter Tables | LLM + Engine | Random encounter tables per connection                             | Optional |
| Assets           | LLM (image)  | Map image, scene illustration, ambient sound                       | Optional |
| Placement        | Engine       | Location added to world graph, event recorded                      | Yes      |

**Stage 1: Description**

```
[CREATE_INTENT]
{
  "type": "location",
  "stage": "description",
  "input": "A crumbling temple deep in the swamp, overgrown with vines, faintly glowing runes on the walls"
}
[/CREATE_INTENT]
```

Engine response:

```
[PIPELINE_STAGE_COMPLETE]
Stage: description
Result:
  name: "The Sunken Temple"
  description: "A crumbling temple half-submerged in swamp water. Vines choke
    the broken columns. Faintly glowing runes pulse on the interior walls,
    casting sickly green light across the flooded nave."
  atmosphere: "Damp, oppressive, ancient. Water drips constantly. Something
    moves beneath the surface."
  traits: ["flooded", "magical", "dangerous", "ancient"]
  visibility: "dark" // Affects perception checks
  danger_level: "high"
[/PIPELINE_STAGE_COMPLETE]
```

**Stage 2: Map/Connections**

```
[PIPELINE_STAGE_COMPLETE]
Stage: connections
Result:
  connections:
    - to: "loc_swamp_path"
      travel_cost: 2
      bidirectional: true
      description: "A narrow boardwalk through the mangroves"
    - to: "loc_ancient_ruins"
      travel_cost: 1
      bidirectional: false
      description: "Underwater tunnel (requires breathing spell or 1 minute breath hold)"
      condition: "actor_has_effect:water_breathing OR skill_check:constitution_dc_15"
  travel_pace:
    cautious: 2x cost, advantage on perception
    normal: 1x cost
    fast: 0.5x cost, disadvantage on stealth
[/PIPELINE_STAGE_COMPLETE]
```

**Stage 3: Encounter Tables**

```
[PIPELINE_STAGE_COMPLETE]
Stage: encounters
Result:
  tables:
    - name: "swamp_creatures"
      trigger: "on_enter OR every 4 turns"
      entries:
        - creature: "Giant Leech", weight: 30, quantity: "1d3"
        - creature: "Swamp Troll", weight: 15, quantity: 1
        - creature: "Will-o-Wisp", weight: 20, quantity: 1
        - creature: "None (clear)", weight: 35, quantity: 0
    - name: "treasure"
      trigger: "on_search"
      entries:
        - item: "Healing Potion", weight: 40, quantity: "1d2"
        - item: "Ancient Rune Fragment", weight: 10, quantity: 1
        - item: "Nothing", weight: 50, quantity: 0
[/PIPELINE_STAGE_COMPLETE]
```

**Stage 4: Assets**

```
[PIPELINE_STAGE_COMPLETE]
Stage: assets
Result:
  assets:
    - label: "map"
      prompt: "Overhead map of a flooded swamp temple, ruins, vines, glowing runes, fantasy RPG style"
      style: "realistic"
    - label: "scene"
      prompt: "Interior of a flooded temple, green glowing runes on walls, vines, dark atmosphere"
      style: "realistic"
    - label: "ambient"
      type: "audio"
      prompt: "Dripping water, distant animal calls, faint magical hum, swamp ambience"
[/PIPELINE_STAGE_COMPLETE]
```

**Stage 5: Placement**

Engine validates:

- Location name unique within world
- All connection targets exist
- No circular connections with travel_cost 0
- Encounter table items exist in world item definitions
- Assets created and linked via asset_links

Records in `world_events`:

```
{
  event_type: "location_created",
  data: {
    name: "The Sunken Temple",
    connections: 2,
    encounters: 2,
    assets: 3
  }
}
```

**Location Pipeline UI:**

```
Step 1: Description
  [Name: The Sunken Temple           ]
  [Atmosphere: Damp, oppressive...   ]
  [Traits: flooded, magical, dangerous]
  [Danger: High ▼                    ]

Step 2: Connections
  [Connected to: Swamp Path (cost 2, bidirectional)]
  [Connected to: Ancient Ruins (cost 1, one-way, requires water breathing)]
  [+ Add Connection]

Step 3: Encounters
  [Table: Swamp Creatures — on_enter, every 4 turns]
    Giant Leech (30%, 1d3)
    Swamp Troll (15%, 1)
    Will-o-Wisp (20%, 1)
    Clear (35%)
  [+ Add Entry] [+ Add Table]

Step 4: Assets
  [Map: "Overhead map of a flooded..."] [Generate] [Preview]
  [Scene: "Interior of a flooded..."]  [Generate] [Preview]
  [Ambient: "Dripping water..."]       [Generate] [Preview]

Step 5: Review & Create
  [Summary: 1 location, 2 connections, 2 encounter tables, 3 assets]
  → Create
```

---

### World Creation Pipeline

Creates an entire world with its settings, theme, rules, and starter
content. This is the most complex pipeline — it bootstraps a playable
environment from a single description.

```
Description → Theme & Rules → Starting Locations → Starter NPCs → Starter Items → Starter Chats → Assets
```

| Stage              | Who            | Output                                           | Required |
| ------------------ | -------------- | ------------------------------------------------ | -------- |
| Description        | LLM            | Name, setting, lore summary, genre, tone         | Yes      |
| Theme & Rules      | LLM + Engine   | RPG bundle, difficulty, chat rules, public notes | Yes      |
| Starting Locations | LLM + Pipeline | 2-5 starter locations with connections           | Yes      |
| Starter NPCs       | LLM + Pipeline | 3-5 key NPCs with stats and motivation           | Optional |
| Starter Items      | LLM + Pipeline | Common/uncommon items for starter shops          | Optional |
| Starter Chats      | Engine         | Pre-created chats (GM intro, tutorial)           | Optional |
| Assets             | LLM (image)    | World map, theme music, lore images              | Optional |

**Stage 1: Description**

```
[CREATE_INTENT]
{
  "type": "world",
  "stage": "description",
  "input": "A gothic horror world set in a cursed kingdom. Vampires rule from
    the shadows. The church is corrupt. Peasants live in fear. Players are
    vampire hunters, but they start weak and must survive."
}
[/CREATE_INTENT]
```

**Stage 2: Theme & Rules**

```
[PIPELINE_STAGE_COMPLETE]
Stage: theme
Result:
  name: "The Cursed Kingdom"
  genre: "gothic_horror"
  tone: "dread, paranoia, moral ambiguity"
  theme: "Surival horror. Power comes at a price. Trust no one."
  bundle: "dnd-5e" // or custom horror bundle
  difficulty: "hard"
  rules:
    - name: "Vampiric Corruption"
      type: "custom"
      description: "Dealing damage with vampiric weapons heals the wielder
        but advances their corruption track. At corruption 10, the character
        becomes an NPC vampire."
    - name: "Holy Water Scarcity"
      type: "effect_trigger"
      description: "Holy water is extremely rare. Each use is significant."
  public_notes:
    - type: "theme"
      content: "Gothic horror. Dread over action. Vampires are terrifying, not sexy."
    - type: "world_lore"
      content: "The kingdom fell 200 years ago when the royal family was turned.
        The church pretends to fight vampires but secretly serves them."
  dark_notes:
    - type: "secret"
      content: "The church leader is the original vampire who cursed the kingdom."
    - type: "arc_plan"
      content: "Act 1: Survive and investigate. Act 2: Discover church betrayal.
        Act 3: Assault the cathedral."
[/PIPELINE_STAGE_COMPLETE]
```

**Stage 3: Starting Locations**

The pipeline calls the location creation pipeline for each starter location:

```
Starting locations:

**Stage 4: Starter NPCs**

Pipeline creates key NPCs with motivation and stats:
```

NPCs:

**Stage 5: Starter Items**

```
Items:
- Wooden Stakes (common, 1d4 piercing, +2d6 vs vampires)
- Holy Water (uncommon, 2d6 radiant vs undead, very rare)
- Garlic Charm (common, disadvantage on vampire charm vs wearer)
- Silver Dagger (uncommon, 1d6+2, bypasses damage resistance)
- Healing Potion (common, 2d4+2 HP)
```

**Stage 6: Starter Chats**

Engine creates pre-configured chats:

```
Chats:
1. "GM Introduction" — solo chat with GM assistant, sets the scene
2. "Village Bulletin Board" — group chat, public rumors and quests
3. "Hunter's Council" — group chat, NPC hunters discuss strategy
```

**Stage 7: Assets**

```
Assets:
- World map: "Gothic kingdom map, dark forests, ruined castles, cursed villages"
- Theme music: "Dark orchestral, organ, choir, tense atmosphere"
- Lore images: "Corrupted church interior", "Vampire manor at night"
```

**World Pipeline UI:**

```
Step 1: Description
  [Name: The Cursed Kingdom              ]
  [Genre: Gothic Horror ▼               ]
  [Setting: A kingdom ruled by vampires...]
  [Tone: Dread, paranoia, moral ambiguity]

Step 2: Theme & Rules
  [Bundle: D&D 5e ▼                     ]
  [Difficulty: Hard ▼                   ]
  [Public Notes: + Add theme, lore...    ]
  [Dark Notes: + Add secrets, arcs...   ]
  [Chat Rules: + Add custom rules...     ]

Step 3: Starting Locations
  [Location 1: Village of Ashwick] [Edit] [Remove]
  [Location 2: Church of the Eternal Dawn] [Edit] [Remove]
  [Location 3: The Black Forest] [Edit] [Remove]
  [+ Add Location]

Step 4: Starter NPCs
  [NPC 1: Father Aldric — Priest, quest giver]
  [NPC 2: Marta the Herbalist — Shop]
  [+ Add NPC]

Step 5: Starter Items
  [Item 1: Wooden Stakes — Common weapon]
  [Item 2: Holy Water — Uncommon consumable]
  [+ Add Item]

Step 6: Assets
  [World Map: Generate] [Theme Music: Upload]
  [+ Add Asset]

Step 7: Review & Create
  [Summary: 5 locations, 5 NPCs, 5 items, 3 chats, 2 assets]
  [Estimated creation time: ~3 minutes]
  → Create World
```

---

### Notes Pipeline (Template-Based)

Instead of writing notes freeform, the GM selects from compatible
templates that ensure consistent structure and proper prompt injection.

#### Template System

#### Built-in Templates

**Public Note Templates:**

| Template           | Fields                                            |
| ------------------ | ------------------------------------------------- |
| `theme_guide`      | genre, tone, pacing, dos, donts                   |
| `plot_hook`        | hook_title, description, suggested_next, urgency  |
| `npc_introduction` | name, role, personality, secret, disposition      |
| `world_lore`       | topic, facts, source, reliability (known/rumored) |
| `location_guide`   | location, atmosphere, dangers, opportunities      |
| `quest_brief`      | quest_name, objective, rewards, complications     |

**Dark Note Templates:**

| Template             | Fields                                                 |
| -------------------- | ------------------------------------------------------ |
| `secret_identity`    | character, true_identity, evidence, reveal_trigger     |
| `planned_twist`      | twist_description, setup_required, reveal_moment       |
| `foreshadow_tracker` | hint_placed, session_placed, target_reveal, subtlety   |
| `consequence_chain`  | action_taken, consequence, trigger_condition, severity |
| `arc_plan`           | arc_name, acts (array), current_act, next_beat         |
| `hidden_enemy`       | enemy_name, motivation, plan_stage, weakness           |
| `world_secret`       | secret, who_knows, how_to_discover, impact_if_revealed |

#### Template Workflow

```
1. GM clicks "Add Note" in Story Notes panel
2. Panel shows template picker:
   [Public Notes]
     Theme Guide | Plot Hook | NPC Introduction | World Lore | Location Guide | Quest Brief
   [Dark Notes]
     Secret Identity | Planned Twist | Foreshadow Tracker | Consequence Chain | Arc Plan | Hidden Enemy | World Secret

3. GM selects "Secret Identity" template
4. Panel shows form with template fields:
   [Character: ________]
   [True Identity: ________]
   [Evidence: ________]
   [Reveal Trigger: ________]
   [Help: What clues will players encounter before the reveal?]

5. GM fills in fields, clicks "Save"
6. Engine assembles the note from template:
   title: "Secret: {character} is {true_identity}"
   content: "SECRET: {character} is actually {true_identity}.
     Evidence: {evidence}
     Reveal trigger: {reveal_trigger}
     Subtlety: weave evidence into narration gradually."

7. Engine validates:
   - All required fields filled
   - Reveal trigger is valid condition
   - Note doesn't duplicate existing dark note (fuzzy match)

8. Saved to dark_notes table, injected into LLM prompt
```

#### Template Validation Rules

```
Required fields:
  - theme_guide: genre, tone (must not be empty)
  - secret_identity: character, true_identity (must differ from current identity)
  - arc_plan: arc_name, acts (minimum 2 acts)
  - consequence_chain: action_taken, trigger_condition (must reference game event)

Cross-field validation:
  - planned_twist: setup_required must reference events before reveal_moment
  - foreshadow_tracker: session_placed < target_reveal session
  - arc_plan: current_act must be one of the defined acts

Duplicate detection:
  - Fuzzy match on title + content against existing notes
  - If >80% similar: warn "Similar note already exists: '{existing_title}'"
  - GM can override warning
```

#### Template Customization

GMs can create custom templates:

```
1. Story Notes panel → "Manage Templates" (GM only)
2. Create New Template:
   [Name: Vampire Weakness Sheet]
   [Entity: Dark]
   [Note Type: secret]
   [Fields:]
     + Add Field: "Vampire Name" (text, required)
     + Add Field: "True Weakness" (textarea, required)
     + Add Field: "Fake Weakness" (textarea, optional)
     + Add Field: "How to Discover" (textarea, required)
     + Add Field: "Exploitation Method" (textarea, optional)
   [Save Template]

3. Template appears in picker for future notes
4. Custom templates are world-scoped (can share between worlds via export)
```

#### Template Export/Import

Templates are shareable:

```
GET /api/worlds/:id/note-templates
Response: NoteTemplate[]

POST /api/worlds/:id/note-templates/import
Body: NoteTemplate[] (from exported world or community share)
```

A "template pack" can be exported from one world and imported to another:

#### Notes Pipeline UI

```
Story Notes Panel → Add Note:

┌─────────────────────────────────────┐
│ Add Note                            │
│                                     │
│ Entity: [Public ▼]                  │
│                                     │
│ Pick a template:                    │
│ ┌──────────┐ ┌──────────┐ ┌──────┐ │
│ │  Theme   │ │   Plot   │ │ NPC  │ │
│ │  Guide   │ │   Hook   │ │Intro │ │
│ └──────────┘ └──────────┘ └──────┘ │
│ ┌──────────┐ ┌──────────┐ ┌──────┐ │
│ │  World   │ │ Location │ │ Quest│ │
│ │  Lore    │ │  Guide   │ │Brief │ │
│ └──────────┘ └──────────┘ └──────┘ │
│                                     │
│ [Custom Template...]                │
│                                     │
│ ── OR write freeform ──             │
└─────────────────────────────────────┘

After selecting "Secret Identity":

┌─────────────────────────────────────┐
│ Secret Identity                     │
│                                     │
│ Character: [Father Aldric        ]  │
│ True Identity: [The original vamp. ]│
│ Evidence: [His aversion to the      │
│   cathedral's inner sanctum.        │
│   The bite marks hidden by his      │
│   robes.]                           │
│ Reveal Trigger: [When players       │
│   enter the cathedral's vault       │
│   and find the 200-year-old         │
│   portrait of the founder —         │
│   identical to Aldric.]             │
│                                     │
│ [Cancel]              [Save Note]   │
└─────────────────────────────────────┘
```

---

## Persona ↔ World Interaction

### Persona World Traits

When a persona enters a world for the first time, they receive a **world trait**
based on the world's theme and the persona's description:

**Example:** A sci-fi persona entering a fantasy world gets the "Fish Out of
Water" trait: -2 WIS (unfamiliar world), +2 INT (advanced knowledge from another
world), narrative hooks about technology vs magic.

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

This enables: "I created a powerful wizard character. Now I want to play AS that
wizard in a new story."

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

### Rule Storage

Rules are stored in a dedicated `chat_rules` table:

| Column      | Type    | Constraints                 | Notes                                  |
| ----------- | ------- | --------------------------- | -------------------------------------- |
| id          | TEXT    | PK, UUID                    |                                        |
| world_id    | TEXT    | FK → worlds.id, nullable    | World-scoped rule                      |
| chat_id     | TEXT    | FK → chats.id, nullable     | Chat/group-chat-scoped rule            |
| location_id | TEXT    | FK → locations.id, nullable | Location-scoped rule                   |
| name        | TEXT    | NOT NULL                    | Rule display name                      |
| description | TEXT    |                             | Rule description                       |
| type        | TEXT    | NOT NULL                    | RuleType enum                          |
| config      | TEXT    | NOT NULL, JSON              | RuleConfig                             |
| enabled     | INTEGER | DEFAULT 1                   | Boolean                                |
| priority    | INTEGER | DEFAULT 100                 | Override priority                      |
| conditions  | TEXT    | JSON array                  | Optional RuleCondition[]               |
| source      | TEXT    | DEFAULT 'user'              | 'gm' \| 'plugin' \| 'system' \| 'user' |
| plugin_id   | TEXT    |                             | Plugin that registered this rule       |
| created_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP   |                                        |
| updated_at  | TEXT    | DEFAULT CURRENT_TIMESTAMP   |                                        |

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

This gives the LLM full awareness of what rules are in effect so it can narrate
accordingly.

### LLM Game Master Rule Management

The LLM Game Master can create, modify, or remove rules via structured intent
blocks (same pattern as combat intent):

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

The engine validates the intent, applies the rule, and injects the result into
the prompt:

```
[RULE APPLIED]
Anti-Magic Barrier activated in Throne Room. Spellcasting prohibited.
[/RULE APPLIED]
```

---

## GM Story Steering & Injections

The GM (human or LLM) guides the narrative through two complementary
systems: **public notes** (visible to players) and **dark notes** (hidden
from players). Both are stored in the world and injected into prompts
at different levels of visibility.

### Public Notes — Story Guidance

Public notes are visible to all players in a world, location, or group
chat. They guide the narrative direction, establish expectations, and
provide context the LLM should incorporate.

#### Scope Hierarchy

```
World Public Notes → visible in all chats within the world
Location Public Notes → visible only in chats at that location
Chat Public Notes → visible only in that specific chat
```

More specific scopes override or augment broader ones.

#### Note Types

| Type               | Purpose                                  | Example                                           |
| ------------------ | ---------------------------------------- | ------------------------------------------------- |
| `theme`            | Tone, genre, atmosphere guidance         | "Gothic horror. Dread over action. Slow burn."    |
| `plot_hook`        | Story threads the GM wants explored      | "The missing miners connect to a deeper evil."    |
| `guidance`         | Direct narrative direction for the LLM   | "The party should investigate the old well next." |
| `npc_motive`       | What NPCs want (visible to players)      | "MerchantBob secretly wants the ruby back."       |
| `world_lore`       | Factual world information everyone knows | "Dragons were extinct for 300 years — until now." |
| `tone_instruction` | How the LLM should narrate               | "No humor. Grimdark. Consequences matter."        |
| `player_prompt`    | Suggestions for players                  | "Consider: what is your character afraid of?"     |

#### Data Model

#### Prompt Injection

Public notes are injected as a visible prompt section:

```
[Story Guidance]
Theme: Gothic horror. Dread over action. Slow burn. No humor.
Plot Hooks:
  - The missing miners connect to a deeper evil beneath the mountain.
  - MerchantBob secretly wants the ruby back — but won't say why.
World Lore:
  - Dragons were extinct for 300 years. That changed last month.
Current Direction:
  - The party should investigate the old well next. Something stirs there.
[/Story Guidance]
```

The LLM reads this section and incorporates it into narration. Unlike
dark notes, players can see this in the prompt debug view.

#### GM Tool Call: Add Public Note

```
[TOOL_CALL]
{
  "tool": "story_note_add",
  "params": {
    "scope": "location",
    "scopeId": "loc_old_well",
    "type": "plot_hook",
    "title": "The Well's Secret",
    "content": "The well is a sealed entrance to an ancient burial chamber. Something has been breaking the seals from below. The party should feel unease when they approach — the air smells wrong, birds avoid the area.",
    "priority": 800
  },
  "narrative": "The well looms before you. The air here feels... wrong."
}
[/TOOL_CALL]
```

#### Editing & Deletion

- GM can edit any public note (full CRUD)
- Players with World Editor role can add notes (if approval queue is
  disabled)
- Notes can be disabled without deleting (toggle enabled/disabled)
- Priority controls injection order — highest first

### Dark Notes — Secret Story Management

Dark notes are GM-only. They contain plot twists, hidden NPC motives,
surprise encounters, and behind-the-scenes story development. Players
**never** see these in prompts or debug views.

#### Purpose

Dark notes let the GM plan ahead without spoiling surprises:

- Track what the players don't know yet
- Plan reveal timing for plot twists
- Manage hidden NPC agendas
- Coordinate multi-session story arcs
- Log foreshadowing planted so far

#### Note Types

| Type          | Purpose                                    | Example                                                     |
| ------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `secret`      | Hidden information players haven't learned | "The king is a vampire. His 'illness' is bloodlust."        |
| `twist`       | Planned reveals or betrayals               | "The friendly guide is the villain's agent."                |
| `foreshadow`  | Subtle hints planted so far                | "Mentioned the guide's unusual knowledge of the catacombs." |
| `hidden_npc`  | NPC motivations unknown to players         | "The priest is secretly a cultist, Level 8."                |
| `consequence` | Upcoming consequences of player actions    | "They stole from the guild — retaliation in 3 sessions."    |
| `arc_plan`    | Multi-session story arc planning           | "Act 1: Mystery → Act 2: Confrontation → Act 3: Revelation" |
| `note`        | Freeform GM notes                          | "Alice seems suspicious of the guide — lean into that."     |

#### Data Model

#### Dark Note Prompt Injection

Dark notes are injected into a **separate, hidden prompt section** that
only the LLM sees — never exposed in the debug view:

```
[GM Dark Notes — DO NOT REVEAL TO PLAYERS]
SECRET: The king is a vampire. His "illness" is bloodlust. The priest
is secretly a cultist helping the vampire maintain power.
TWIST: The friendly guide is the villain's agent. Reveal trigger: when
the party reaches the burial chamber.
FORESHADOW PLANTED:
  - Guide's unusual knowledge of catacombs (session 2)
  - King's refusal to meet in daylight (session 3)
  - Mysterious blood donations from the village (session 1)
PENDING CONSEQUENCES:
  - Guild retaliation for theft (due: 3 sessions)
ARC PLAN: Act 1 (current) → Mystery. Act 2 → Confrontation with guide.
  Act 3 → Revelation about the king.
URGENT: Guide's loyalty check should happen within 2 sessions.
[/GM Dark Notes — DO NOT REVEAL TO PLAYERS]
```

The LLM uses this context to:

- Plant appropriate foreshadowing in narration
- Build tension toward planned reveals
- Avoid accidentally revealing secrets
- Guide player attention toward plot hooks
- Reference hidden NPC motivations naturally

#### Reveal System

When a dark note's reveal condition is met, the engine:

1. Moves the note from dark → public (or removes it if it's purely hidden)
2. Updates the revealedAt timestamp
3. Injects a reveal notification:

```
[REVEAL TRIGGERED]
Dark note "The Guide's Betrayal" has been revealed.
Players now know: The guide was working for the villain all along.
Removed from dark notes, available for public reference.
[/REVEAL TRIGGERED]
```

The LLM then narrates the reveal dramatically.

#### GM Tool Call: Add Dark Note

```
[TOOL_CALL]
{
  "tool": "dark_note_add",
  "params": {
    "scope": "world",
    "type": "twist",
    "title": "The Guide's Betrayal",
    "content": "The friendly guide 'Elara' is actually an agent of the villain Lord Malachar. She has been feeding him information about the party's progress. She will sabotage the burial chamber seal when the party arrives.",
    "revealTrigger": "party_reaches_burial_chamber",
    "revealCondition": "when the party enters the burial chamber, Elara 'accidentally' breaks the wrong seal",
    "urgency": "high",
    "relatedNotes": ["note_malachar_plan", "note_burial_chamber_layout"],
    "dependsOn": "note_party_trusts_elara"
  },
  "narrative": "(GM note recorded — not narrated)"
}
[/TOOL_CALL]
```

#### Dark Note Views

The GM has a dedicated "Story Notes" panel in the world detail page:

- **Public tab** — all public notes, editable by GM and editors
- **Dark tab** — all dark notes, GM-only (hidden from other users)
- **Timeline view** — shows notes in reveal order
- **Relationship graph** — visual map of connected dark notes
- **Filter by**: type, scope, urgency, revealed/unrevealed

#### Dark Note Visibility Rules

| Who               | Sees Public Notes | Sees Dark Notes |
| ----------------- | ----------------- | --------------- |
| GM / World Owner  | Yes               | Yes             |
| World Editor      | Yes               | No              |
| World Viewer      | Yes               | No              |
| Player in chat    | Yes               | No              |
| Prompt Debug View | Yes               | **Never**       |

Dark notes are never included in:

- Chat exports
- World exports (or are stripped before export)
- Shared world bundles
- Any API response to non-GM users
- Prompt debug view

#### GM Workflow

A typical GM session:

```
1. Review dark notes → plan what to advance this session
2. Add/update public notes → set theme, current direction
3. Start chat → LLM sees public guidance + dark context
4. During play:
   - LLM narrates foreshadowing from dark notes
   - GM adds new dark notes for plot developments
   - GM adds public notes when players learn new info
5. Reveal triggers hit → engine promotes dark → public
6. Session ends → GM reviews revealed notes, updates arc plan
```

#### Example: Multi-Session Arc

```
Session 1 (Dark Notes):
  - secret: "The village elder is a werewolf"
  - foreshadow: "Elder avoids the full moon festival"
  - arc_plan: "Reveal at the festival — players witness transformation"

Session 2 (Dark Notes):
  - twist: "The elder's curse was inflicted by the baron"
  - consequence: "Elder will attack if cornered"
  - public note added: "The elder seems... uncomfortable about the festival"

Session 3 (Reveal):
  - reveal triggered: "Players attend the festival, elder disappears"
  - dark note promoted to public: "The elder is a werewolf"
  - new dark note: "The baron is the true villain"
  - arc_plan updated: "Act 2 → Confront the baron"
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

The hybrid approach ensures the LLM never directly mutates game state. Plugin
resolvers provide the mechanical backbone; the LLM provides the narrative skin.

### Plugin Bundle Presets

Plugin bundles are **pre-configured groups of RPG mechanic plugins** that
activate together as a cohesive ruleset. A bundle defines which resolvers, stat
templates, skill lists, and default chat rules compose a complete game system.

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

A scope can have **exactly one active bundle**. Switching bundles migrates state
if possible (same stat names), or resets to defaults (new stat system).

### Fine Tuning Per Scope

Once a bundle is active, its behavior can be **fine-tuned** per scope without
modifying the bundle itself. Fine-tuning overlays sit on top of the bundle
defaults:

#### Fine-Tuning UI (Web)

A world settings panel showing:

- **Header:** World name ("Forgotten Realm") with bundle selector (D&D 5e)
- **Stat Range:** Slider 1–30 with starting points input (27)
- **Difficulty:** Slider 0.5–2.0 with XP rate slider 1.0–2.0
- **Active Skills:** Toggle list with checkboxes (Athletics ✓, Acrobatics ✓,
  Animal Handling ✘, Arcana ✓, Stealth ✓)
- **Custom Skills:** Add button, each showing stat, base DC, description (e.g.,
  "Jedi Lore" → INT, DC 15)
- **Chat Override:** Per-chat overrides inheriting from world bundle (e.g.,
  "Campaign 1" overrides difficulty to 1.0)

#### Fine-Tuning via LLM GM

The LLM GM can fine-tune mechanics through structured intent:

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

These can be shared between users or downloaded from a community registry.

### Plugin RPG Engine Integration with Rules System

Chat rules (defined in the Rules System section above) and plugin bundles work
together:

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

### Phase 1: Foundation (Current → MVP)

| Task                                  | Files                                           | Status      |
| ------------------------------------- | ----------------------------------------------- | ----------- |
| `actor_items` table + migration       | `src/db/schema-actors.ts`, `src/db/migrations/` | Not started |
| Equipment slots on `actor_items`      | Schema + `src/characters/equipment.ts`          | Not started |
| Basic stat block on `actors.settings` | Schema update                                   | Not started |
| Stat computation (base + equipment)   | `src/rpg/stat-computer.ts`                      | Not started |
| Equip/unequip service                 | `src/rpg/equipment.ts`                          | Not started |

### Phase 2: Dice & Combat (Future)

| Task                          | Files                            | Status      |
| ----------------------------- | -------------------------------- | ----------- |
| Dice engine (parser + roller) | `src/rpg/dice.ts`                | Not started |
| Pre-seeded dice queue         | `src/rpg/dice-queue.ts`          | Not started |
| Combat intent extraction      | `src/rpg/combat-intent.ts`       | Not started |
| Combat resolution pipeline    | `src/rpg/combat-resolver.ts`     | Not started |
| Status effect system          | `src/rpg/status-effects.ts`      | Not started |
| Event extraction upgrade      | `src/story/events/extraction.ts` | Not started |

### Phase 3: Skills & XP (Future)

| Task                             | Files                     | Status      |
| -------------------------------- | ------------------------- | ----------- |
| Skill definitions                | `src/rpg/skills.ts`       | Not started |
| Skill check resolution           | `src/rpg/skill-checks.ts` | Not started |
| XP tracking on world actor state | Schema + `src/rpg/xp.ts`  | Not started |
| Level-up logic                   | `src/rpg/leveling.ts`     | Not started |
| Loot table system                | `src/rpg/loot.ts`         | Not started |

### Phase 4: Persona-World (Future)

| Task                           | Files                          | Status      |
| ------------------------------ | ------------------------------ | ----------- |
| Persona world traits           | `src/personas/world-traits.ts` | Not started |
| Persona ↔ character conversion | `src/personas/conversion.ts`   | Not started |
| RPG-enhanced prompt assembly   | `src/rpg/prompt-assembly.ts`   | Not started |
| Currency system                | `src/rpg/currency.ts`          | Not started |

### Phase 5: Chat Rules & Scoped Mechanics (Future)

| Task                                     | Files                                          | Status      |
| ---------------------------------------- | ---------------------------------------------- | ----------- |
| `chat_rules` table + migration           | `src/db/schema-rules.ts`, `src/db/migrations/` | Not started |
| Chat rule CRUD service                   | `src/rpg/rules-service.ts`                     | Not started |
| Rule resolution pipeline (scope cascade) | `src/rpg/rules-resolver.ts`                    | Not started |
| Rule intent extraction from LLM          | `src/rpg/rules-intent.ts`                      | Not started |
| Rule prompt injection                    | `src/rpg/rules-prompt.ts`                      | Not started |
| Location-scoped rule activation          | `src/rpg/rules-location.ts`                    | Not started |

### Phase 6: Plugin Engine & Bundles (Future)

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

## Difficulty Levels (MVP)

### Overview

Difficulty levels control how strictly RPG mechanics are enforced and what
happens on failures. MVP uses a **standalone config on the `worlds` table** —
not gated behind bundles.

### Configuration (on `worlds` table)

Three columns replace the bundle-gated system:

| Column                | Type | Default   | Notes                                               |
| --------------------- | ---- | --------- | --------------------------------------------------- |
| `difficulty_modifier` | REAL | `1.0`     | 0.5-2.0 DC multiplier                               |
| `difficulty_reroll`   | TEXT | `'off'`   | `'off'` \| `'once'`                                 |
| `difficulty_state`    | TEXT | `'alive'` | `'alive'` \| `'dead'` (initial actor state on join) |

### Preset Modes

| Mode     | Modifier | Reroll | State   | Notes                        |
| -------- | -------- | ------ | ------- | ---------------------------- |
| Casual   | `0.7`    | `once` | `alive` | Easier DCs, one retry        |
| Normal   | `1.0`    | `off`  | `alive` | Standard rules               |
| Hard     | `1.5`    | `off`  | `alive` | Tougher DCs, no retries      |
| Iron Man | `1.0`    | `off`  | `dead`  | Permadeath — no resurrection |

### Iron Man — Permadeath Semantics

**Trigger:** Actor's HP reaches 0 or a fatal failure occurs.

**Effect:**

- `world_actor_state.state` set to `'dead'` for that actor
- Dead actor becomes **observer** — can READ world events, cannot act
- No resurrection, no replay. Full world recreation (new UUID) required to bring
  back character

**Prompt injection for dead actors:**

```
[OBSERVER MODE] Your character ({name}) has fallen. You can read the world's events but cannot act. The story continues without you.
```

### State Machine

`dead` is terminal. Only `alive` → `dead` transition exists (fatal damage or
Iron-Man death). No path back. `alive` is the default for actors joining a
non-Iron-Man world.

### Prompt Injection

When active, inject difficulty rules into the LLM prompt:

```
[Active Rules]
- Difficulty: {mode_name} (DC modifier: {modifier}x)
- Rerolls: {reroll_policy}
- Death: {death_policy}
```

### Implementation Notes

---

## Assistant/GM Safe Tools

The assistant (in GM or Pure Assistant role) can execute structured tool calls
during gameplay. These tools mutate game state through validated engine
functions — the LLM never directly writes to the database.

### Tool List

| Tool                | Parameters                                       | Effect                                  | Permission       |
| ------------------- | ------------------------------------------------ | --------------------------------------- | ---------------- |
| `roll_dice`         | notation (`"2d6+3"`), reason                     | Returns total, individual rolls         | All roles        |
| `skill_check`       | skill, dc, actor_id                              | Rolls d20 + modifier vs DC              | All roles        |
| `item_transfer`     | item_id, from_actor_id, to_actor_id, quantity    | Moves item between inventories          | GM (influencing) |
| `money_transfer`    | from_actor_id, to_actor_id, amount, denomination | Transfers currency between actors       | GM (influencing) |
| `inventory_inspect` | actor_id                                         | Returns full inventory + equipment      | All roles (read) |
| `status_apply`      | effect, target_actor_id, duration                | Applies status effect to target         | GM (influencing) |
| `status_remove`     | effect, target_actor_id                          | Removes status effect from target       | GM (influencing) |
| `quest_update`      | quest_id, status, progress                       | Updates quest state                     | GM (influencing) |
| `location_move`     | actor_id, location_id                            | Moves actor to a different location     | GM (influencing) |
| `world_state_edit`  | key, value                                       | Edits world state snapshot              | GM (influencing) |
| `npc_state_edit`    | npc_id, key, value                               | Edits NPC state                         | GM (influencing) |
| `loot_generate`     | loot_table_id, location_id                       | Rolls loot and places items at location | GM (influencing) |
| `xp_grant`          | actor_id, amount, reason                         | Awards XP to an actor                   | GM (influencing) |

### Tool-Call Interface

Tools are invoked via structured intent blocks in the LLM output, following
the same pattern as `COMBAT_INTENT`:

```
[TOOL_CALL]
{
  "tool": "item_transfer",
  "params": {
    "item_id": "sword_001",
    "from_actor_id": "npc_merchant",
    "to_actor_id": "player_01",
    "quantity": 1
  },
  "narrative": "The merchant hands you the blade."
}
[/TOOL_CALL]
```

The engine:

### Permission Matrix

| Tool                | Pure Assistant | Observer GM | Influencing GM | User (self) |
| ------------------- | -------------- | ----------- | -------------- | ----------- |
| `roll_dice`         | ✓              | ✓           | ✓              | ✓           |
| `skill_check`       | ✓              | ✓           | ✓              | ✓           |
| `inventory_inspect` | read only      | read only   | read/write     | own only    |
| `item_transfer`     | —              | —           | ✓              | —           |
| `money_transfer`    | —              | —           | ✓              | —           |
| `status_apply`      | —              | —           | ✓              | —           |
| `status_remove`     | —              | —           | ✓              | —           |
| `quest_update`      | —              | —           | ✓              | —           |
| `location_move`     | —              | —           | ✓              | —           |
| `world_state_edit`  | —              | —           | ✓              | —           |
| `npc_state_edit`    | —              | —           | ✓              | —           |
| `loot_generate`     | —              | —           | ✓              | —           |
| `xp_grant`          | —              | —           | ✓              | —           |

### User Self-Service Tools

Users can invoke a subset of tools on their own actor without GM mediation.
These are "safe" tools that only affect the caller's own state:

- `roll_dice` — roll dice for their own checks
- `skill_check` — attempt a skill check on their own behalf
- `inventory_inspect` — view their own inventory

All other tools require GM permission. This prevents players from
self-authorizing item transfers, XP grants, or status changes.

### Tool Execution Logging

Every tool call is logged to `generation_attempts` (or a dedicated
`tool_calls` table if added) with:

- Who called it (actor_id)
- What tool and parameters
- Result (success/failure + data)
- Which rules were active during execution

This audit trail enables debugging, replay, and undo.

---

## In-Game Economy & Trading

### Trading Approaches

loop-lore supports three trading interfaces, from simplest to most complex.
MVP uses narrative-mediated trading (option B or C). Option A is a future
enhancement.

#### Option A: Dedicated Trade Screen (Future)

A dedicated UI where two actors exchange items and currency simultaneously.
Both parties see each other's inventories, propose trades, and confirm.

- **Pros:** Clear, unambiguous, no LLM dependency
- **Cons:** High implementation cost, breaks narrative flow
- **When:** Post-MVP, if demand warrants

#### Option B: Assistant/GM-Mediated Trading (Recommended MVP)

The LLM narrates the trade. The engine validates and executes. Same pattern
as combat — LLM proposes, code disposes.

```
1. Player says: "I want to buy the sword from the merchant"
2. LLM narrates: "The merchant examines the blade. '50 gold,' he says."
3. LLM outputs [TOOL_CALL]:
   {
     "tool": "money_transfer",
     "params": { "from": "player_01", "to": "npc_merchant", "amount": 50 }
   }
   and:
   {
     "tool": "item_transfer",
     "params": { "item": "sword_001", "from": "npc_merchant", "to": "player_01" }
   }
4. Engine validates: player has ≥ 50 gold, merchant has the sword
5. Engine executes both transfers atomically
6. LLM narrates the completed transaction
```

**Advantages:** works within existing tool-call architecture, no new UI,
narrative-driven.

#### Option C: NPC Interaction via Narrative (Simplest)

The LLM plays the NPC merchant directly. Trading happens entirely through
dialogue. The engine only intervenes when the player confirms a transaction
via a UI action (button click).

```
**Advantages:** zero new LLM tooling, natural conversation flow.
**Disadvantages:** harder to enforce mechanical constraints (the LLM might
"forget" the price).

### Trade Validation Rules

Regardless of trading approach, the engine enforces these rules:

1. **Sufficient funds** — buyer must have ≥ asking price in gold (or
   equivalent denomination after exchange rate conversion)
2. **Item existence** — seller must have the item in their inventory with
   sufficient quantity
3. **Atomic execution** — item transfer and currency transfer happen in a
   single transaction. If either fails, neither applies
4. **No negative quantities** — transfer quantity must be ≥ 1 and ≤ seller's
   available quantity
5. **Self-trade prevention** — an actor cannot trade with themselves
6. **Encumbrance check** (optional) — warn if buyer would exceed carry
   capacity after receiving items

### Currency Exchange

When trading across denominations, the engine uses the exchange rate table:
```

100 copper = 1 silver
10 silver = 1 gold
10 gold = 1 platinum

```
The engine auto-converts: if a player has 15 silver and needs to pay 1 gold,
the engine deducts 10 silver (1 gold equivalent) and leaves 5 silver.

### Bartering System (Future)

A negotiation mechanic where the LLM mediates haggling:
```

Player: "I'll give you 30 gold for the sword."
LLM (as merchant): "30? This blade is worth at least 45. How about 40?"
Player: "Deal."
Engine: validates 40 gold, executes transfer

```
This is a natural extension of option B/C — no new mechanics needed, just
prompt engineering for the NPC's pricing logic.

### Shopkeeper NPCs

Shopkeepers are regular NPCs with an additional `shop_inventory` concept.
The GM or world author defines:

- What items the shopkeeper carries (from item definitions)
- Pricing (may differ from base item value — markup/discount)
- Restock schedule (daily, weekly, or never)

The shopkeeper's inventory is stored as world items with
`owner_actor_id` set to the shopkeeper's actor ID. The same item
transfer tools apply.

### Player-to-Player Trading

In multi-user group chats, players can trade directly:

1. Player A offers an item: "I'll trade you my healing potion for that map"
2. Player B confirms: "Deal"
3. LLM outputs tool calls for the exchange
4. Engine validates and executes atomically

The GM can optionally require approval for player-to-player trades
(configurable per world).

---

## Reference

### Related Documents

| Document                  | Covers                                     |
| ------------------------- | ------------------------------------------ |
| `docs/spec/character-spec.md` | Character card system, format support      |
| `docs/actors.md`          | Actor data model, item tables              |
| `docs/schema.md`          | Database schema                            |
| `docs/story/`             | Story system, quests, events               |
| `docs/memory-system.md`   | Character memories                         |
| `docs/plugin-system.md`   | Plugin architecture, tool/role definitions |
| `docs/assets.md`          | Asset upload and linking pipeline          |

## Economy Balancing Tools (Draft)

> **Status:** Design sketch. Not implemented.

GM-facing tools for monitoring and balancing the in-game economy. The
economy is a closed system — gold and items flow between actors, shops,
and the world. These tools help GMs detect imbalances.

### Key Metrics

| Metric                   | Formula                                | Healthy Range          |
| ------------------------ | -------------------------------------- | ---------------------- |
| Gold supply              | SUM(all actor gold)                    | 100-10000              |
| Gold velocity            | gold_transfers / time_period           | Growing slowly         |
| Item circulation         | items_traded / total_items             | 30-70%                 |
| Wealth inequality        | max(actor_gold) / median(actor_gold)   | < 10x                  |
| Shop price effectiveness | items_bought / items_available_at_shop | 20-80%                 |
| Loot rarity distribution | COUNT(items) GROUP BY rarity           | Follows expected curve |

### Alert Thresholds

The GM can configure alerts for when metrics drift:
```

gold_supply > 50000 → "Warning: excessive gold in circulation"
wealth_inequality > 20 → "Warning: one player holds most wealth"
item_circulation < 10 → "Warning: items are hoarded, not traded"

```
### Balancing Levers

GMs can adjust the economy via world rules:

| Lever                | Effect                                   |
| -------------------- | ---------------------------------------- |
| Tax rate             | Percentage deducted on each transaction  |
| Shop markup/discount | Global modifier on shop prices           |
| Loot drop rate       | Multiplier on loot table generation      |
| Gold sink events     | Town taxes, repair costs, travel fees    |
| Item decay           | Consumables degrade over time (optional) |

### Dashboard UI

On the world detail page, an "Economy" tab (GM only) shows:

- **Gold flow chart** — sources (loot, quests, shops) vs sinks (shops, taxes)
- **Wealth distribution** — histogram of actor gold values
- **Item flow Sankey** — visual flow of items between actors and shops
- **Trade log** — recent transactions with timestamps

---

## World Economics (Draft)

> **Status:** Design sketch. Not implemented.

World economics is the macro-level counterpart to actor economics. While
actor economics tracks individual wealth, world economics tracks the
entire economy: currency supply, prices, inflation, and market dynamics.

### Currency Supply

Each world has a total currency pool. Gold enters via loot/quests and
exits via shops/taxes. The engine tracks this automatically.

### Inflation / Deflation

The price index adjusts automatically based on supply and demand:
```

priceIndex = totalGoldInCirculation / baselineGoldSupply

```
| Index Range | State          | Effect                                  |
| ----------- | -------------- | --------------------------------------- |
| < 0.7       | Deflation      | Prices drop, NPCs hoard gold            |
| 0.7–1.3     | Stable         | Normal prices                           |
| 1.3–2.0     | Inflation      | Prices rise, NPCs raise wages           |
| > 2.0       | Hyperinflation | Currency loses meaning, barter replaces |

**Baseline gold supply** is set per world at creation (default: 5000g).
The GM can adjust it via tool calls.

### Dynamic Shop Pricing

Shop prices are not static — they adjust based on supply, demand, and
location:

**Price formula:**
```

finalPrice = basePrice × priceIndex × locationMarkup × demandModifier
× (1 - reputationDiscount) × scarcityModifier

```
### Regional Price Variations

Different locations have different price levels:

| Location Type    | Markup | Reason                       |
| ---------------- | ------ | ---------------------------- |
| Major city       | 1.2    | High demand, higher rent     |
| Small village    | 0.9    | Lower overhead               |
| Frontier town    | 1.5    | Scarce goods, transport cost |
| Dungeon shop     | 2.0    | Convenience premium          |
| Black market     | 1.8    | Risk premium, no regulation  |
| Starting village | 0.7    | Beginner-friendly pricing    |

The GM sets location markup via world settings or chat rules.

### Supply & Demand

Items track supply levels per location. When actors buy/sell, supply
adjusts:
```

// Buying an item
shop.supply[itemId] -= quantity;
if (shop.supply[itemId] < lowThreshold) {
demandModifier *= 1.2; // Price goes up
}

// Selling an item
shop.supply[itemId] += quantity;
if (shop.supply[itemId] > highThreshold) {
demandModifier *= 0.8; // Price goes down
}

```
Supply thresholds (configurable per world):

| Threshold    | Default | Effect                       |
| ------------ | ------- | ---------------------------- |
| Low          | 2       | Price multiplier ×1.2        |
| Critical Low | 0       | Item unavailable, price ×2.0 |
| Normal       | 10      | Price multiplier ×1.0        |
| High         | 20      | Price multiplier ×0.8        |
| Surplus      | 50      | Price multiplier ×0.5        |

### Market Events

Dynamic events that affect the economy:

| Event             | Effect                                 | Duration      |
| ----------------- | -------------------------------------- | ------------- |
| Trade route open  | All prices ×0.8 in connected locations | Until closed  |
| Trade route cut   | Prices ×1.5, scarcity ×2               | Until cleared |
| Festival          | Luxuries ×0.5, inns ×2.0               | 3-7 days      |
| Plague            | Healers ×2.0, general ×0.8             | 1-4 weeks     |
| War               | Weapons ×2.0, armor ×1.5, food ×1.3    | Until peace   |
| Dragon sighting   | All prices ×1.2, weapons ×1.5          | 1-2 weeks     |
| Mine discovery    | Ore prices ×0.5, metals ×0.7           | 1-3 weeks     |
| Bountiful harvest | Food prices ×0.5                       | 1 season      |
| Tax holiday       | All purchases -10% tax                 | 1-7 days      |

Events are injected by the GM via tool calls or triggered automatically
by quest outcomes.

### Economic Factions

Groups that control economic activity:

Factions affect:

- **Member discounts**: Guild members get better prices
- **Access control**: Some shops only serve certain factions
- **Protection**: Trading under guild protection = no theft
- **Blacklists**: Enemies of a faction pay premium or are refused service

### GM Economy Dashboard

On the world detail page, an "Economy" tab (GM only) shows:

- **Gold flow chart** — sources (loot, quests) vs sinks (shops, taxes)
- **Wealth distribution** — histogram of actor gold values
- **Price index trend** — inflation/deflation over time
- **Item flow** — visual flow of items between actors and shops
- **Top earners** — wealthiest actors ranked
- **Trade log** — recent transactions with timestamps
- **Active events** — current market events and their effects
- **Faction standings** — economic power balance

### Integration with Actor Economics

World economics and actor economics are coupled:

### P2P Trading & Barter

Actor-to-actor trading is the core exchange mechanism between characters.
Unlike shop transactions (fixed prices), P2P trades are negotiated —
the LLM narrates haggling, the engine validates fairness.

#### Trade Types

| Type        | Gold Involved | Items Involved   | Validation               |
| ----------- | ------------- | ---------------- | ------------------------ |
| Direct Sale | Yes           | Yes              | Gold check + value check |
| Barter      | No            | Yes (both sides) | Value comparison         |
| Hybrid      | Yes           | Yes              | Both checks              |
| Gift        | Optional      | Optional         | None (voluntary)         |
| Loan        | Yes           | No               | Debt record created      |
| Commission  | Yes (escrow)  | Yes              | Quest-linked             |

#### Barter Resolution Pipeline
```

1. Initiator proposes trade (LLM narrative + TRADE_INTENT)
2. Engine computes values:
   - Initiator's offer: items + gold
   - Target's offer: items + gold
   - Fairness ratio = initiatorValue / targetValue
3. If skill check requested:
   a. Roll d20 + CHA modifier + proficiency
   b. Compare to DC (set by LLM or computed from value gap)
   c. Apply outcome modifier to trade terms
4. If fairness ratio outside acceptable range:
   - LLM receives warning: "This trade is lopsided"
   - LLM can narrate NPC refusal or counter-offer
5. Engine validates:
   - Both parties own offered items
   - Gold amounts are sufficient
   - No trade cooldown active
   - Trade value within world limits
6. Execute atomic swap:
   - Remove items/gold from both parties
   - Add received items/gold to both parties
   - Record transaction for both actors
   - Update reputation if applicable
7. Inject result to LLM
8. LLM narrates the completed exchange

```
#### Value Comparison Engine

Barter trades need fair value estimation. The engine compares:
```

initiatorValue = sum(item.value × quantity) + initiatorGold
targetValue = sum(item.value × quantity) + targetGold

fairnessRating:
0.8 ≤ ratio ≤ 1.2 → "Fair"
0.5 ≤ ratio < 0.8 → "Unfair to you"
1.2 < ratio ≤ 2.0 → "Unfair to them"
ratio < 0.5 or > 2.0 → "Lopsided"

```
Value comes from `item_definitions.value` (base gold value). The engine
can also factor in:

- **Rarity multiplier**: common ×1.0, uncommon ×1.5, rare ×2.5, legendary ×5.0
- **Demand modifier**: items in scarce supply are worth more
- **Condition modifier**: damaged items worth 50-75%
- **Enchantment modifier**: magical items worth 2-10× base value
- **Quest item flag**: key items marked as "priceless" (cannot be bartered)

#### Barter Skill Checks

When the LLM declares a skill check for barter:

**DC computation** (if not set by LLM):
```

dc = 10 + floor(abs(fairnessRatio - 1.0) * 20)

```
| Fairness Ratio | Computed DC | Example               |
| -------------- | ----------- | --------------------- |
| 0.9–1.1        | 10–12       | Nearly fair trade     |
| 0.7–0.9        | 14–18       | You're getting a deal |
| 0.5–0.7        | 18–22       | Very favorable to you |
| > 1.2          | 14+         | You're overpaying     |

**Outcome effects:**

| Outcome          | Trade Effect                                   |
| ---------------- | ---------------------------------------------- |
| Critical Success | Target accepts, +10 trust, may offer extras    |
| Success (by 1-5) | Target accepts, +5 trust                       |
| Success (by 6+)  | Target accepts, +3 trust, +1 faction rep       |
| Failure          | Target refuses or demands better terms         |
| Critical Failure | Target refuses, -5 trust, may end relationship |

#### Group Chat Multi-Party Trading

In group chats, multiple actors can bid on the same item:
```

[ACTIVE OFFERS]
Item: Potion of Flight (held by Alice)

- Bob: 150g
- Carol: 200g + Short Sword (total: 260g)
- Dave: 300g (highest bid)

Alice can:
a. Accept highest bid (Dave, 300g)
b. Accept any bid (Carol's item combo may be preferred)
c. Counter-offer ("I want 350g")
d. Withdraw item from trade
e. Start an auction with a deadline
[/ACTIVE OFFERS]

```
Auction mechanics:

- LLM narrates the auction, sets deadline (turns or time)
- Engine tracks all bids, validates each
- At deadline, highest bidder wins
- If no bids, item stays with Alice

#### Escrow for Commissions

For task-based trades (commissions, deliveries), the engine holds gold
in escrow:
```

#### Trade Cooldown & Limits

Worlds can configure restrictions:

| Setting           | Default | Description                            |
| ----------------- | ------- | -------------------------------------- |
| `p2p_trade`       | true    | Allow actor-to-actor trading           |
| `barter`          | true    | Allow item-for-item swaps              |
| `proximity_check` | false   | Actors must be in same location        |
| `trade_tax`       | 0%      | Tax on gold involved in trades         |
| `max_trade_value` | 0       | Cap per trade (0 = unlimited)          |
| `cooldown_turns`  | 0       | Turns between trades (0 = no cooldown) |
| `escrow_enabled`  | true    | Allow escrow for commissions           |
| `auction_enabled` | true    | Allow multi-party auctions             |

#### LLM Prompt Injection

```
[P2P Trade — {{char}}]
Recent Trades:
  - Traded Healing Potion for Map with Merchant Bob (Fair, +5 trust)
  - Gifted 100g to Ally Alice (No return expected)
  - Loaned 200g to Rogue Dan (due: 5 days, 2% daily)

Active Offers:
  - Potion of Flight: 3 bids, highest 300g (Dave)
  - Commission: Deliver letter to mayor (50g escrow, 3 turns left)

Merchant Reputation:
  - Ironhold Smith: trust 65, discount 3%
  - Merchant Bob: trust 40, credit limit 100g
```

### Prompt Injection (GM only)

```
[World Economy — {{world}}]
Total Gold: 12,400g in circulation | Baseline: 5,000g
Price Index: 2.48 (Hyperinflation)
Active Events:
  - War with Northern Realm: weapons ×2.0, food ×1.3
  - Trade Route Cut: all goods ×1.5

Top Earners:
  1. Dragon Ashara: 85,000g
  2. Merchant Lord Holt: 12,000g
  3. Player Alice: 1,200g

Faction Prices:
  - Ironhold Guild: standard prices, members -15%
  - Black Market: all prices ×1.8, no questions asked
```

### External References

| System                 | Relevance                                    |
| ---------------------- | -------------------------------------------- |
| D&D 5e SRD             | Stat system, combat resolution, skill checks |
| Multihog DnD Framework | Dual-model state tracking, hybrid RNG        |
| Horae (SillyTavern)    | Modular RPG, equipment slots, status bars    |
| Waypoint               | "LLM proposes, code disposés" architecture   |
| OpenDungeon            | TypeScript mechanics + LLM narrative         |
