# Flexible RPG Implementation Patterns

## Overview

Patterns for implementing universal, adaptable RPG mechanics in loop-lore.
Focus on modularity, extensibility, and genre-crossing compatibility.

---

## 1. Data-Driven Rules Configuration

### World-Level Rules Schema

```typescript
interface WorldRules {
  // Core mechanics
  dice_system: "d20" | "fate" | "savage" | "gurps" | "forge";
  attributes: string[]; // Configurable attribute list
  skill_list: string[]; // Configurable skills

  // Optional modules
  modules: {
    magic?: MagicRules;
    cybernetics?: CyberneticsRules;
    vehicles?: VehicleRules;
    sanity?: SanityRules;
  };

  // Scaling
  stat_cap?: number;
  level_cap?: number;

  // Genre variants
  damage_model: "abstract" | "realistic" | "dice";
  armor_model: "ac" | "dr" | "none";
}
```

### Implementation Strategy

- Rules stored in `worlds.rules` JSON column
- Engine reads configuration at runtime
- Modules loaded conditionally based on world settings
- No hardcoded genre assumptions

---

## 2. Effect-Based System

### Generic Effect Structure

```typescript
interface GameEffect {
  id: string;
  source: "item" | "spell" | "status" | "world";
  target: "self" | "other" | "area";
  duration: "instant" | "turn" | "scene" | "permanent";

  // Stat modifiers
  modifiers?: {
    stat?: Partial<Record<string, number>>;
    skill?: Partial<Record<string, number>>;
  };

  // Special effects
  flags?: {
    advantage?: boolean;
    reroll?: boolean;
    extra_action?: boolean;
    immune?: string[];
  };

  // Stacking rules
  stacking: "none" | "same_type" | "different_type";
}
```

### Application Points

- **Effective stats**: Apply modifiers at computation time
- **Roll bonuses**: Add to d20/skill check rolls
- **Status effects**: Apply during combat resolution
- **World modifiers**: Environmental effects (darkness, weather)

---

## 3. Modular Rules Loading

### Module Registration

```typescript
// src/rules/modules/registry.ts
interface RulesModule {
  id: string;
  name: string;
  version: string;

  // Hooks into resolution pipeline
  hooks: {
    beforeRoll?: (context: RollContext) => RollContext;
    afterRoll?: (result: RollResult) => RollResult;
    beforeDamage?: (damage: Damage) => Damage;
    afterDamage?: (damage: Damage, target: Actor) => void;
  };

  // Configurable options
  defaults: Record<string, unknown>;
}

const MODULES: Record<string, RulesModule> = {
  magic: {/* spell slots, mana, etc. */},
  cybernetics: {/* implants, humanity, etc. */},
  vehicles: {/* speed, handling, vehicle HP */},
  sanity: {/* fear, horror checks */},
};
```

### Loading Pattern

```typescript
function loadWorldRules(worldId: string): RulesEngine {
  const world = db.selectFrom("worlds").where("id", "=", worldId);
  const modules = world.rules.modules || {};

  const engine = new RulesEngine();
  for (const [id, config] of Object.entries(modules)) {
    const mod = MODULES[id];
    if (mod) engine.register(mod, config);
  }
  return engine;
}
```

---

## 4. Generic Combat Resolution

### Intent-Based Pipeline

```typescript
interface CombatIntent {
  action: "attack" | "cast" | "use_item" | "move" | "interact";
  target?: string;
  weapon?: string;
  spell?: string;
  item?: string;
  energy_spent?: number;
  modifiers?: string[];
}

// Resolution flow
async function resolveCombat(
  intent: CombatIntent,
  actor: Actor,
  target: Actor | null,
): Promise<CombatResult> {
  // 1. Parse intent (LLM or structured input)
  // 2. Apply modifiers from equipment/status
  // 3. Roll dice (d20 + modifiers)
  // 4. Check hit/miss
  // 5. Roll damage if hit
  // 6. Apply status effects
  // 7. Return structured result
}
```

### Cross-Genre Actions

| Action   | Fantasy      | Modern  | Sci-fi        | Horror     |
| -------- | ------------ | ------- | ------------- | ---------- |
| Attack   | Melee weapon | Firearm | Energy weapon | Improvised |
| Cast     | Spell        | Device  | Tech power    | Ritual     |
| Use Item | Potion       | Medkit  | Stim          | Tome       |
| Move     | Walk         | Run     | Fly           | Flee       |

---

## 5. Attribute/Skill Abstraction

### Configurable Attributes

```typescript
// World defines available attributes
const fantasyAttributes = ["str", "dex", "con", "int", "wis", "cha"];
const cyberpunkAttributes = ["str", "dex", "con", "int", "wis", "cha", "tech"];
const superheroAttributes = ["str", "dex", "con", "int", "wis", "cha", "pow"];

interface ActorStats {
  base: Record<string, number>; // Configurable by world
  modifiers: Modifier[];
  computed: Record<string, number>; // Base + modifiers
}
```

### Skill Mapping

```typescript
// Skills can be attribute-linked or standalone
interface Skill {
  id: string;
  name: string;
  attribute?: string; // If linked, max = attribute
  category?: string; // "combat", "social", "magic", etc.
  base: number;
  bonuses: Modifier[];
}

// Universal skill list that adapts
const universalSkills = [
  { id: "athletics", attribute: "str", categories: ["physical"] },
  { id: "stealth", attribute: "dex", categories: ["physical", "subterfuge"] },
  { id: "hacking", attribute: "int", categories: ["modern", "cyberpunk"] },
  { id: "arcana", attribute: "int", categories: ["fantasy", "magic"] },
  { id: "medicine", attribute: "wis", categories: ["modern", "fantasy"] },
];
```

---

## 6. Energy/Action Economy Patterns

### Generic Energy System

```typescript
interface EnergySystem {
  max: number; // Computed from stats
  current: number; // Current available
  recovery: "round" | "rest" | "time";

  // Action costs
  costs: {
    move: number;
    standard_action: number;
    full_action: number;
    reaction: number;
  };
}

// Forge-style variable expenditure
class ActionBuilder {
  private energy = 0;

  spend(base: number): this {
    this.energy += base;
    return this;
  }

  add(variable: number): this {
    this.energy += variable;
    return this;
  }

  // Check if actor has enough energy
  canPay(actor: Actor): boolean {
    return actor.energy.current >= this.energy;
  }
}
```

### Energy Recovery Patterns

- **Round-based**: Recover at turn start (tactical)
- **Rest-based**: Recover after short/long rest (D&D-style)
- **Time-based**: Recover over time (realistic)
- **Triggered**: Recover on specific events (successful hits, etc.)

---

## 7. Meta-Currency Systems

### Generic Meta-Currency

```typescript
interface MetaCurrency {
  type: "fate_point" | "benny" | "hero_point" | "inspiration";
  amount: number;
  max?: number;
  refresh: number; // Per session/scene

  // Uses
  uses: {
    reroll: boolean;
    bonus: number;
    invoke_aspect: boolean;
    soak_damage: boolean;
  };
}

// Award triggers (narrative)
const META_TRIGGERS = ["good_roleplay", "creative_solution", "character_development", "story_advancement"];
```

### Integration with Rewards

```typescript
// Quest completion awards both XP and meta-currency
interface QuestReward {
  xp: number;
  currency?: Record<string, number>;
  items?: string[];
  meta?: {
    fate_points?: number;
    bennies?: number;
  };
}
```

---

## 8. Status Effect Framework

### Generic Status

```typescript
interface StatusEffect {
  id: string;
  name: string;

  // Duration
  duration: number | "until_removed";
  tick: "start_turn" | "end_turn" | "on_action";

  // Mechanical effects
  effects: {
    stat_modifiers?: Partial<Record<string, number>>;
    roll_bonus?: number;
    damage_per_tick?: number;
    save_penalty?: number;
    action_restrictions?: string[];
  };

  // Narrative effects
  description: string;
  visible_to_player: boolean;
}

// Examples
const POISONED: StatusEffect = {
  id: "poisoned",
  name: "Poisoned",
  duration: "1d4",
  tick: "start_turn",
  effects: {
    roll_bonus: -2,
    damage_per_tick: "1d4",
  },
  description: "Taking poison damage each turn",
  visible_to_player: true,
};
```

---

## 9. Item Template System

### Universal Item Definition

```typescript
interface ItemTemplate {
  id: string;
  name: string;
  description: string;
  category: "weapon" | "armor" | "consumable" | "tool" | "misc";
  slot?: string; // If equippable

  // Mechanical properties
  properties: {
    damage_dice?: string;
    damage_type?: string;
    ac_bonus?: number;
    stat_bonuses?: Partial<Record<string, number>>;
    requires_attunement?: boolean;
  };

  // Cost/value
  cost: {
    currency?: string;
    value?: number;
    rarity?: "common" | "uncommon" | "rare" | "unique";
  };

  // Module-specific
  module_data?: Record<string, unknown>;
}

// Fantasy weapon
const longsword: ItemTemplate = {
  category: "weapon",
  slot: "mainHand",
  properties: {
    damage_dice: "1d8",
    damage_type: "slashing",
  },
};

// Cyberpunk implant
const neuralInterface: ItemTemplate = {
  category: "tool",
  slot: "amulet",
  properties: {
    stat_bonuses: { int: 2 },
  },
  module_data: {
    cybernetics: { humanity_loss: -1 },
  },
};
```

---

## 10. Progression System Patterns

### XP-Based Level Progression

```typescript
interface LevelProgression {
  formula: "linear" | "polynomial" | "exponential";

  // Linear: level * multiplier + base
  linear?: { multiplier: number; base: number };

  // Polynomial: level^2 * a + level * b + c
  polynomial?: { a: number; b: number; c: number };

  // Level effects
  on_level_up: {
    hp_bonus?: number | "con_mod";
    mp_bonus?: number | "int_mod";
    stat_increases?: number;
    feature_unlocks?: string[];
  };
}

// D&D 5e style
const dndProgression: LevelProgression = {
  formula: "polynomial",
  polynomial: { a: 0, b: 100, c: 0 }, // level * 100
  on_level_up: {
    hp_bonus: "con_mod",
    stat_increases: 1, // Every 4 levels
  },
};
```

### Milestone Progression

```typescript
// Quest-based advancement
interface MilestoneProgress {
  quest_completions: number;
  story_beats: string[];
  threshold: number;
  on_threshold: {
    level?: number;
    features?: string[];
  };
}
```

---

## 11. Testing Integration

### Synthetic Test Scenarios

```typescript
// Generate test cases from mechanics
interface MechanicsTestCase {
  name: string;
  system: "d20" | "fate" | "savage";
  action: string;

  // Inputs
  actor_stats: Record<string, number>;
  modifiers: Modifier[];
  dc?: number;

  // Expected outputs
  expected_success_rate: number; // Statistical
  expected_damage_range?: [number, number];
  expected_effects?: string[];
}

// Example: Combat balance testing
const combatTests = [
  {
    name: "level_5_vs_level_3",
    system: "d20",
    action: "attack",
    actor_stats: { str: 16, dex: 14 },
    dc: 13, // Typical AC
    expected_success_rate: 0.65, // 65% hit chance
  },
];
```

---

## 12. Configuration Examples

### Fantasy World

```yaml
rules:
  dice_system: d20
  attributes: [str, dex, con, int, wis, cha]
  modules:
    magic:
      spell_slots: true
      mana: false
      schools: [evocation, illusion, necromancy, ...]
  damage_model: dice
  armor_model: ac
```

### Cyberpunk World

```yaml
rules:
  dice_system: d20
  attributes: [str, dex, con, int, wis, cha, tech]
  modules:
    cybernetics:
      humanity_track: true
      implant_slots: [cyber_eye, neural, limb, ...]
    hacking:
      opposed_rolls: true
      program_slots: 3
  damage_model: realistic
  armor_model: dr
```

### Superhero World

```yaml
rules:
  dice_system: fate
  attributes: [str, dex, con, int, wis, cha, pow]
  modules:
    powers:
      power_points: true
      power_level: 10
  damage_model: abstract
  armor_model: none
  stat_cap: 20
```

### Horror World

```yaml
rules:
  dice_system: d20
  attributes: [str, dex, con, int, wis, cha]
  modules:
    sanity:
      sanity_track: true
      fear_effects: true
    investigation:
      clue_system: true
  damage_model: dice
  armor_model: ac
```

---

## 13. Actor Relationships & Standing

### Relationship Effects

Relationships provide mechanical and narrative modifiers:

```typescript
interface RelationshipEffect {
  type: "disposition" | "trust" | "fear" | "respect" | "romance";
  target: "self" | "other" | "both";
  modifier: number; // Applied to rolls/social checks
  condition?: string; // When effect applies
}

// Example: Rival relationship
const RIVAL_EFFECTS: RelationshipEffect[] = [
  { type: "disposition", target: "other", modifier: -2, condition: "combat" },
  { type: "respect", target: "self", modifier: +1 }, // Motivated by rivalry
];
```

### Standing-Based Quest Gating

```typescript
interface StandingRequirement {
  minStanding: number;
  faction?: string; // If specific faction required
  relationship?: {
    targetActorId: string;
    minDisposition: number;
  };
}

// Quest gated by standing
const STANDING_GATED_QUEST = {
  id: "royal_audience",
  name: "Royal Audience",
  requirements: {
    minStanding: 50,
    faction: "kingdom",
  },
  // Only available at Hero tier with kingdom
};
```

### Romance/Subtext Mechanics

For worlds enabling romantic content:

```typescript
interface RomanceTrack {
  actorA: string;
  actorB: string;
  worldId: string;

  // Progression stages
  stage: "none" | "interested" | "flirting" | "dating" | "committed" | "broken_up";

  // Compatibility score
  compatibility: number; // 0-100 based on aligned values

  // Mechanical modifiers
  modifiers: {
    persuasion: number; // Social roll bonus
    combat: number; // Bonus when fighting together
    stress_relief: number; // Stress recovery bonus
  };

  // Milestone tracking
  milestones: {
    first_meeting?: string;
    first_date?: string;
    first_kiss?: string;
    intimacy?: string;
  };
}
```