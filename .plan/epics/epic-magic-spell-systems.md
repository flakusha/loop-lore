# EPIC: Magic & Spell Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Very High
**Issue:** `e03faaf`
**Type:** Feature Epic
**Tags:** magic, spells, mana, elements, casting, enchanting

## Overview

Comprehensive magic and spellcasting system — spell schools, elemental magic, mana/resource management, spell components, cooldowns, spell crafting, enchanting, and magical item creation. Supports multiple magic system paradigms (Vancian, mana-based, component-based) configurable per world.

## Core Systems

### Spell Schools & Elements

```typescript
interface SpellSchool {
  id: string;
  name: string; // 'evocation', 'necromancy', 'illusion', 'divination', etc.
  description: string;
  element: ElementalAffinity;
  difficulty: "beginner" | "intermediate" | "advanced" | "master";
  prerequisites: SpellPrerequisite[];
}

interface ElementalAffinity {
  primary: Element; // 'fire', 'water', 'earth', 'air', 'lightning', 'ice', 'arcane', 'holy', 'shadow'
  secondary?: Element;
  weakness: Element;
  resistance: Element;
}

type Element =
  | "fire"
  | "water"
  | "earth"
  | "air"
  | "lightning"
  | "ice"
  | "arcane"
  | "holy"
  | "shadow"
  | "nature"
  | "psychic"
  | "necrotic";
```

### Magic System Paradigms

| Paradigm      | Description                                      | Config                        |
| ------------- | ------------------------------------------------ | ----------------------------- |
| **Vancian**   | Prepare spells in advance, slots refresh on rest | `magic.paradigm: 'vancian'`   |
| **Mana Pool** | Spend mana to cast, regenerates over time        | `magic.paradigm: 'mana'`      |
| **Component** | Requires physical/spiritual components           | `magic.paradigm: 'component'` |
| **Hybrid**    | Mix of paradigms per world                       | `magic.paradigm: 'hybrid'`    |

### Spell Structure

```typescript
interface Spell {
  id: string;
  name: string;
  school: SpellSchool;
  level: number; // 0-9 cantrip to 9th level
  casting_time: "action" | "bonus_action" | "reaction" | "ritual" | "concentration";
  range: number; // in feet, 0 = self
  components: SpellComponent[];
  duration: number; // in rounds, 0 = instant
  description: string;
  effects: SpellEffect[];
  scaling: SpellScaling;
  mana_cost: number;
  cooldown: number; // in rounds
  concentration: boolean;
  ritual: boolean;
}

interface SpellComponent {
  type: "verbal" | "somatic" | "material" | "focus";
  description: string;
  consumed: boolean;
  cost?: number; // gold value for material components
}

interface SpellEffect {
  type: "damage" | "heal" | "buff" | "debuff" | "utility" | "summon" | "teleport" | "control";
  target: "self" | "single" | "aoe" | "cone" | "line" | "sphere";
  element?: Element;
  dice?: DiceExpression;
  status_effect?: StatusEffect;
  save?: SaveType;
}
```

### Mana & Resource System

```typescript
interface MagicResource {
  current: number;
  max: number;
  regeneration_rate: number; // per round or per turn
  regen_type: "passive" | "active" | "on_kill" | "on_hit";
  overflow_behavior: "waste" | "convert_to_temp" | "damage";
}

interface ManaModifiers {
  intelligence_bonus: number;
  wisdom_bonus: number;
  equipment_bonus: number;
  buff_bonus: number;
  world_modifier: number;
}
```

### Spell Crafting & Discovery

```typescript
interface SpellCrafting {
  // Players can create custom spells
  base_spell: Spell;
  modifications: SpellModification[];
  success_chance: number; // based on skill + components
  failure_effects: SpellFailureEffect[];
}

interface SpellModification {
  type: "element_shift" | "range_boost" | "damage_boost" | "duration_boost" | "aoe_change";
  cost_multiplier: number;
  stability_penalty: number;
}

interface SpellDiscovery {
  // Discover spells through experimentation
  experimentation: ExperimentAttempt[];
  discovered_spells: Spell[];
  discovery_chance: number; // based on knowledge + luck
}
```

### Enchanting System

```typescript
interface Enchanting {
  // Add magical properties to items
  item: Item;
  enchantment: Enchantment;
  soul_gem: SoulGem;
  success_chance: number;
  durability_cost: number;
}

interface Enchantment {
  id: string;
  name: string;
  type: "weapon" | "armor" | "accessory" | "consumable";
  effect: SpellEffect;
  charges: number; // -1 = unlimited
  recharging_method: "soul_gem" | "rest" | "time" | "none";
}

interface SoulGem {
  size: "petty" | "lesser" | "common" | "greater" | "grand" | "black";
  filled: boolean;
  creature_type: string;
  soul_strength: number;
}
```

## Spell Progression

### Learning Spells

| Method              | Description            | Success Rate               |
| ------------------- | ---------------------- | -------------------------- |
| **Spell Tomes**     | Learn from books       | 100% (if requirements met) |
| **Experimentation** | Discover through trial | Skill-based                |
| **Quests**          | Unlock through story   | Guaranteed                 |
| **NPC Teaching**    | Learn from mentors     | Relationship-based         |
| **World Discovery** | Find in the world      | Random                     |

### Spell Mastery

```typescript
interface SpellMastery {
  spell_id: string;
  times_cast: number;
  mastery_level: "novice" | "adept" | "expert" | "master";
  bonuses: MasteryBonus[];
  special_effects: MasteryEffect[];
}
```

## Integration Points

- **RPG Mechanics** — Stats (INT, WIS) affect spell power, mana pool, success chance
- **Combat System** — Spells are combat actions, initiative affects casting
- **Crafting System** — Enchanting uses crafting mechanics
- **Plugin System** — Schools/elements are plugin-extensible
- **World & Locations** — Magic zones, magical weather, ley lines

## Open Questions

- Should magic be restricted by world/setting (e.g., no magic in sci-fi)?
- How to handle anti-magic zones?
- Should spell failure have catastrophic effects?
- How to balance magic vs. physical combat?
- Should there be a "wild magic" system for uncontrolled casting?

## Files

- `src/rpg/magic/` — magic system root
- `src/rpg/magic/spells.ts` — spell definitions
- `src/rpg/magic/schools.ts` — spell schools
- `src/rpg/magic/elements.ts` — elemental system
- `src/rpg/magic/mana.ts` — mana/resource system
- `src/rpg/magic/casting.ts` — casting mechanics
- `src/rpg/magic/enchanting.ts` — enchanting system
- `src/rpg/magic/crafting.ts` — spell crafting
- `src/rpg/magic/discovery.ts` — spell discovery
- `src/rpg/magic/mastery.ts` — spell mastery progression
- `src/db/schema-magic.ts` — magic tables
- `src/routes/magic.ts` — magic API

## Related Epics

- **Epic RPG Mechanics** — Core stats, dice, combat integration
- **Epic Battle & Action Systems** — Combat spell actions
- **Epic Plugin System** — Schools/elements extensibility
- **Epic World & Locations** — Magic zones, ley lines

## Linked Tasks

- TASK-magic-spell-systems.md
