<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# RPG Systems Comparison: Universal Engines for Flexible Implementation

## Overview

Research into universal RPG systems that inform loop-lore's flexible mechanics design.
Each system offers different approaches to universality, modularity, and cross-genre compatibility.

---

## 1. d20 System (D&D 5e / Pathfinder Foundation)

### Core Mechanic

```
d20 + modifier vs target number (DC)
```

### Strengths for loop-lore

- **Universally understood**: Most RPG players know d20 mechanics
- **Simple resolution**: Roll high beats target
- **Extensible**: Modifiers can represent any genre element
- **Pre-seeded queues**: Deterministic mode matches d20 fairness expectations

### Key Components

| Component      | Implementation                              |
| -------------- | ------------------------------------------- |
| Attributes     | 6 core stats (STR, DEX, CON, INT, WIS, CHA) |
| Modifiers      | `floor((stat - 10) / 2)`                    |
| Skills         | Derived from attributes, DC table (5-30)    |
| Combat         | Attack (d20+attack), Damage (weapon+STR)    |
| Status Effects | Modifiers to rolls/saves, durations         |

### Universal Application

- **Fantasy**: Weapons, armor, spells
- **Modern**: Firearms use DEX, vehicles use different stats
- **Sci-fi**: Energy weapons, cybernetics as equipment bonuses
- **Horror**: Sanity as WIS save, fear effects as status

**Source**: d20srd.org, D&D 5e SRD

---

## 2. FATE Core

### Core Mechanic

```
dF (Fudge dice: -1, 0, +1) + skill vs opposition
```

### Strengths for loop-lore

- **Aspects system**: Flexible descriptors that can be invoked/paid
- **Stress tracks**: Universal harm representation
- **Approaches**: Alternative to attributes (Careful, Clever, Flashy, Forceful, Quick, Sneaky)
- **Narrative-first**: Mechanics serve story, not constrain it

### Key Components

| Component         | Implementation                                    |
| ----------------- | ------------------------------------------------- |
| Approaches/Skills | Skill pyramid: 1 Great, 2 Good, 3 Fair, 4 Average |
| Aspects           | Descriptive phrases, invoked with Fate Points     |
| Stress            | Boxes (physical/mental) based on skills           |
| Consequences      | Moderate, severe, extreme (lasting harm)          |
| Fate Points       | Meta-currency for invoking aspects, rerolling     |

### Skill Pyramid (Default)

```
Great (+4): 1 skill
Good (+3): 2 skills
Fair (+2): 3 skills
Average (+1): 4 skills
Mediocre (+0): All others
```

### Universal Application

- **Aspects as lore**: World lore entries become invocable aspects
- **Stress tracks**: Can represent HP, stamina, sanity, etc.
- **Approaches**: Genre-neutral action categories

**Source**: fate-srd.com

---

## 3. Savage Worlds (SWADE)

### Core Mechanic

```
Target Number 4: dX, count successes (dX >= 4)
Wild Die: d6 for important characters
```

### Strengths for loop-lore

- **Bennies system**: Meta-currency for rerolls, soak, initiative
- **Wild Cards**: Distinction between important and background characters
- **Fast resolution**: Multiple dice, quick counting
- **Exploding dice**: "Raises" add excitement

### Key Components

| Component        | Implementation                                   |
| ---------------- | ------------------------------------------------ |
| Traits           | d4 to d12 (or d20 for attributes)                |
| Wild Die         | d6 for PCs/NPCs, can reroll once                 |
| Bennies          | GM grants for good roleplay, spent for rerolls   |
| Edges/Hindrances | Advantages/disadvantages with mechanical effects |
| Raises           | 2+ over TN = extra effect                        |

### Universal Application

- **Trait scaling**: d4 (weak) to d12 (peak human) to d20 (superhuman)
- **Bennies for LLM**: Reward narrative consistency, creativity
- **Edges as plugins**: Modular character capabilities

**Source**: savage-worlds.wikidot.com

---

## 4. GURPS (Generic Universal RPG System)

### Core Mechanic

```
3d6 under target number (3-18 range)
```

### Strengths for loop-lore

- **Point-based**: Everything has a cost
- **Advantages/Disadvantages**: Comprehensive catalog
- **Skill system**: 300+ skills for granularity
- **Ultra-universal**: Works from cavemen to space opera

### Key Components

| Component       | Implementation                                 |
| --------------- | ---------------------------------------------- |
| Attributes      | ST (Strength), DX (Dexterity), IQ, HT (Health) |
| Secondary Stats | HP, Will, Per (Perception), FP (Fatigue)       |
| Skills          | Attribute-based, default when untrained        |
| Advantages      | Cost points, permanent benefits                |
| Disadvantages   | Gain points, drawbacks/flaws                   |
| Points          | Character budget determines power level        |

### Point-Based Character Creation

```
Character points = 15 (40 pts) to 500+ (demigods)
Advantages: 5-150 pts each
Disadvantages: -5 to -40 pts (flaws worth points)
Skills: 1 pt per level
```

### Universal Application

- **Modular advantages**: Cybernetics, magic, psionics as separate modules
- **Technology level**: TL1-12 scales tech from stone to space
- **Genre boxes**: Separate rules for fantasy, sci-fi, horror

**Source**: sjgames.com/gurps

---

## 5. Forge Engine

### Core Mechanic

```
d10 dice pools with opposed rolls
Energy system controls action economy
```

### Strengths for loop-lore

- **Energy pools**: Regenerating resource for action economy
- **Dice pool construction**: S.A.G.E. mnemonic (Spend, Add, Gain, Externalities)
- **Concurrent turns**: All actors act simultaneously
- **Tactical decisions**: Energy allocation creates meaningful choices

### Key Components

| Component     | Implementation                                     |
| ------------- | -------------------------------------------------- |
| Attributes    | 6 attributes (STR, AGI, STA, INF, INT, ACU)        |
| Skills        | Related to attributes, cannot exceed attribute     |
| Energy Pool   | Max = sum of 3 highest attributes                  |
| Action Pools  | SAGE construction: spend, add, gain, externalities |
| Defense Pools | Physical (PD) and Mental (MD) defense              |
| Opposed Rolls | d10 pools vs d10 pools, degrees of success         |

### Energy System

```
Spend: Initial effort, set aside
Add: Variable effort, goes into dice pool
Expend: Extraordinary, not recovered until rest
All spent/added energy recovers each round
Expended energy requires rest
```

### Universal Application

- **Energy as resource**: Mana, stamina, action points
- **Opposed pools**: Works for combat, social, mental contests
- **Attribute flexibility**: Physical/Mental split adapts to any setting

**Source**: forgesrd.opengamingnetwork.com

---

## 6. MARS RPG

### Core Mechanic

```
Modules and Modes architecture
Core rules + optional complexity layers
```

### Strengths for loop-lore

- **Modular design**: Add complexity as needed
- **Modes system**: Genre-specific rule variations
- **Building blocks**: Consistent foundation across genres
- **Minimal overhead**: Core rules stay simple

### Key Components

| Component       | Implementation                     |
| --------------- | ---------------------------------- |
| Core Rules      | Basic dice, attributes, skills     |
| Modules         | Optional rules for specific genres |
| Modes           | Variations on core mechanics       |
| Building Blocks | Reusable components across modules |

### Modular Architecture

```
MARS Core (simple): Basic d20-style
MARS Advanced (complex): Adds modules for more "game"
Modules: Magic, Cybernetics, Vehicles, etc.
Modes: Fantasy, Modern, Sci-fi variants
```

**Source**: marsrpg.com

---

## Comparison Matrix

| System        | Dice       | Attributes   | Skills       | Meta-Currency   | Universal | Complexity  |
| ------------- | ---------- | ------------ | ------------ | --------------- | --------- | ----------- |
| d20           | d20        | 6 core       | Derived      | None (optional) | High      | Medium-High |
| FATE          | Fudge (dF) | Approaches   | 18 default   | Fate Points     | High      | Low         |
| Savage Worlds | d4-d12     | 4 attributes | 20+ skills   | Bennies         | High      | Medium      |
| GURPS         | 3d6        | 4 core       | 300+         | None            | Very High | High        |
| Forge Engine  | d10 pools  | 6 attributes | Skill-linked | Energy          | High      | Medium      |
| MARS          | d20-style  | Variable     | Variable     | Variable        | High      | Variable    |

---

## Recommendations for loop-lore

### Primary: d20 Foundation

- **Why**: Universally understood, simple implementation
- **How**: Use for attack rolls, skill checks, saving throws
- **Extension**: Modifiers handle genre-specific effects

### Secondary: FATE Aspects

- **Why**: Narrative flexibility, lore integration
- **How**: Lore entries become invocable aspects
- **Implementation**: `WorldLoreEntries` can grant Fate Point equivalents

### Tertiary: Savage Worlds Bennies

- **Why**: Reward good roleplay, creative narration
- **How**: GM grants "bennies" for memorable moments
- **Implementation**: Quest/completion rewards

### Tactical Layer: Forge Energy

- **Why**: Action economy without complex turn tracking
- **How**: Energy = actions per turn, regen each round
- **Implementation**: `world_states.energy` field

### Modular Extension: MARS Modules

- **Why**: Add genre rules without breaking core
- **How**: `world.rules.modules` array
- **Examples**:
  - `magic`: Spell slots, mana costs
  - `cybernetics`: Implant slots, humanity loss
  - `vehicles`: Vehicle HP, speed, handling
  - `horror`: Sanity, fear effects

---

## Implementation Mapping

### Current loop-lore Features

| Feature        | Maps To      | Notes                        |
| -------------- | ------------ | ---------------------------- |
| Dice Engine    | d20          | Implemented, extensible      |
| Stat System    | d20/GURPS    | 6 core stats, modifiers      |
| Combat Intent  | All systems  | Structured extraction        |
| Status Effects | All systems  | Generic modifier application |
| Quest System   | FATE/GURPS   | Progress tracking            |
| Turn Manager   | Forge/Savage | Strategy patterns            |

### Missing for Full Flexibility

| Feature                | Priority | System Inspiration |
| ---------------------- | -------- | ------------------ |
| Energy Pool            | Medium   | Forge Engine       |
| Aspects/Fate Points    | Low      | FATE Core          |
| Advantage/Disadvantage | Low      | Savage/GURPS       |
| Modular Rules Loading  | High     | MARS, GURPS        |
| Opposed Rolls          | Medium   | Forge, Savage      |

---

## Genre Adaptation Patterns

### Fantasy

```yaml
rules:
  modules: [magic, combat, items]
  magic_system: "vancian" # or "spell_points"
  weapon_damage: "dice" # d8 longsword
  armor_ac: true
```

### Cyberpunk

```yaml
rules:
  modules: [cybernetics, hacking, combat]
  attributes: [str, dex, con, int, wis, cha, tech] # Add Tech
  currency: "credit"
  death: "hp_0_or_crippled"
```

### Horror

```yaml
rules:
  modules: [sanity, investigation, combat]
  sanity_stat: "wis"
  fear_effects: true
  stress_tracks: ["sanity", "physical"]
```

### Modern Military

```yaml
rules:
  modules: [combat, vehicles, equipment]
  damage: "realistic" # GURPS-style
  armor: "DR" # Damage Reduction
  critical: "savage" # Raises on high rolls
```

### Superheroes

```yaml
rules:
  modules: [powers, combat]
  attribute_cap: 20
  skill_cap: "superb" # FATE-style
  energy: "unlimited" # No action limit
```

---

## 7. Standing & Reputation Systems Across RPGs

### d20 Reputation

Most d20 games do not have formal reputation, but D&D has:

- **Background**: Folk Hero, Noble, Soldier grant standing benefits
- **Factions**: Harpers, Zhentarim affect NPC reactions
- **Renown**: In Adventurers League, tracks reputation with organizations

### FATE Reputation

- **Aspects as reputation**: "Known Hero of Waterdeep" is an invocable aspect
- **Stress as reputation**: Social stress tracks
- **Compels**: Reputation can be compelled for complications

### Savage Worlds Reputation

- **Edges**: "Charismatic" gives +2 to NPC reactions
- **Hindrances**: "Enemy" creates standing complications
- **Status**: Royalty, Noble edges affect social standing

### GURPS Reputation

- **Reputation advantage**: +1 to reactions, 10 pts per level
- **Reputation levels**: 1-4 (Local to International)
- **Enemies**: Opposite of reputation, -1 per level

### Universal Standing Patterns

Reputation tiers common across systems:

| Tier     | Range       | Modifier |
| -------- | ----------- | -------- |
| Unknown  | -100 to -20 | -2       |
| Neutral  | -19 to +19  | 0        |
| Friendly | +20 to +49  | +1       |
| Ally     | +50 to +79  | +2       |
| Hero     | +80 to +99  | +3       |
| Legend   | +100        | +4       |

Standing change triggers:

- Quest complete: +10 standing
- Gift given: +5 standing
- Betrayal: -20 standing
- Defeat enemy: +15 standing

### Implementation in loop-lore

Standing integrates with existing systems:

- **Quests**: Standing requirements gate quest availability
- **Shops**: Standing modifies prices and item availability
- **NPCs**: Standing affects dialogue options and reactions
- **Social rolls**: Standing provides bonus/penalty to persuasion/intimidation
- **Lore**: Reputation aspects become invocable (FATE-style)

---

## 8. Romance & Relationship Mechanics

### d20 Romance

- **Background**: "Charlatan" implies romantic history
- **Skills**: Persuasion, Performance handle romance
- **Optional**: No formal romance rules in core

### FATE Romance

- **Aspects**: "Hopelessly in Love with Elara"
- **Stress**: Social/emotional stress tracks
- **Compels**: Romance creates complications/opportunities

### Savage Worlds Romance

- **Edges**: "Attractive", "Very Attractive" give bonuses
- **Hindrances**: "Enemy", "Secret" complicate relationships
- **Social skills**: Humanities, Streetwise for romance

### Universal Romance Patterns

Romance progression stages:

| Stage      | Threshold | Effects                                   |
| ---------- | --------- | ----------------------------------------- |
| None       | 0         | No modifiers                              |
| Interested | 20        | Persuasion +1                             |
| Flirting   | 40        | Persuasion +2, Combat +1                  |
| Dating     | 60        | Persuasion +3, Stress Relief 2            |
| Committed  | 80        | Persuasion +4, Combat +2, Stress Relief 3 |

Compatibility calculation factors:

- Alignment match: +20
- Shared backgrounds: +15
- Aligned values: +15 (or -5 if opposed)

### Implementation Considerations

- **Opt-in**: Worlds must enable romance mechanics
- **Consent**: Per-session confirmation for explicit content
- **Mechanical**: Bonuses to social rolls, combat synergy
- **Narrative**: Milestone tracking (first date, first kiss, etc.)
- **Privacy**: Romance tracks encrypted/isolated per NSFW guidelines
