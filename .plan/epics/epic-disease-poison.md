# EPIC: Disease & Poison Systems

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Epic
**Tags:** disease, poison, ailments, healing, resistance, alchemy

## Overview

Disease and poison mechanics — afflictions, symptoms, cures, resistance, and healing. Integrates with alchemy for antidote creation and combat for poison application.

## Disease System

### Disease Types

| Type             | Transmission       | Severity      | Duration              |
| ---------------- | ------------------ | ------------- | --------------------- |
| **Plague**       | Airborne, contact  | Severe        | Days-weeks            |
| **Curse**        | Magical            | Variable      | Until cured           |
| **Parasite**     | Contact, ingestion | Moderate      | Days-months           |
| **Infection**    | Wounds             | Mild-moderate | Days                  |
| **Madness**      | Magical, trauma    | Severe        | Permanent until cured |
| **Degenerative** | Age, exposure      | Gradual       | Permanent             |

### Disease Structure

```typescript
interface Disease {
  id: string;
  name: string;
  type: DiseaseType;
  severity: "mild" | "moderate" | "severe" | "fatal";
  transmission: TransmissionType[];
  incubation_period: number; // in hours
  duration: number; // in hours, -1 = permanent
  symptoms: Symptom[];
  stages: DiseaseStage[];
  cures: Cure[];
  resistance_check: SaveType;
  contagious: boolean;
  mortality_rate: number; // 0-100
}

interface DiseaseStage {
  stage: number;
  duration: number;
  symptoms: Symptom[];
  stat_modifiers: StatModifier[];
  visual_effects: VisualEffect[];
  behavior_changes: BehaviorChange[];
}

interface Symptom {
  type: "stat_reduction" | "periodic_damage" | "movement_slow" | "visual" | "behavioral" | "incapacitation";
  severity: number; // 1-10
  description: string;
  onset: number; // hours after infection
}
```

### Disease Progression

```typescript
interface DiseaseInstance {
  disease: Disease;
  infected_character: Character;
  infection_time: Date;
  current_stage: number;
  progression_speed: number; // modifier
  treatments_applied: Treatment[];
  immunity: boolean;
  carrier: boolean; // can spread without symptoms
}
```

## Poison System

### Poison Types

| Type         | Application        | Effect    | Duration      |
| ------------ | ------------------ | --------- | ------------- |
| **Contact**  | Touch, trap        | Immediate | Minutes       |
| **Ingested** | Food, drink        | Delayed   | Hours         |
| **Inhaled**  | Gas, smoke         | Immediate | Minutes       |
| **Injected** | Weapon, needle     | Immediate | Minutes-hours |
| **Magical**  | Spell, enchantment | Variable  | Variable      |

### Poison Structure

```typescript
interface Poison {
  id: string;
  name: string;
  type: PoisonType;
  potency: number; // 1-100
  onset_time: number; // in minutes
  duration: number; // in minutes
  effects: PoisonEffect[];
  antidote: Antidote;
  detection_difficulty: number;
  lethal: boolean;
  dosage: Dosage;
}

interface PoisonEffect {
  type: "damage" | "stat_drain" | "status_effect" | "hallucination" | "paralysis" | "sleep" | "death";
  magnitude: number;
  interval: number; // damage per interval in minutes
  save_type: SaveType;
  save_dc: number;
}

interface Dosage {
  min_effective: number; // units
  lethal_threshold: number;
  tolerance_buildup: number; // per dose
}
```

### Poison Application

```typescript
interface PoisonApplication {
  poison: Poison;
  target: Character;
  method: "weapon" | "food" | "trap" | "direct" | "gas";
  dosage: number;
  detection_check: number;
  resistance_check: number;
  result: PoisonResult;
}

interface PoisonResult {
  applied: boolean;
  detected: boolean;
  resisted: boolean;
  effective_dosage: number;
  onset_time: Date;
  effects_active: PoisonEffect[];
}
```

## Cure & Treatment System

### Cure Types

| Type              | Source        | Effectiveness   |
| ----------------- | ------------- | --------------- |
| **Antidote**      | Alchemy       | 100% if correct |
| **Herbal Remedy** | Herbalism     | 50-80%          |
| **Healing Magic** | Divine/Arcane | 70-100%         |
| **Rest**          | Natural       | 20-50%          |
| **Surgery**       | Skill-based   | 60-90%          |
| **Prayer**        | Faith-based   | Variable        |

### Cure Structure

```typescript
interface Cure {
  id: string;
  name: string;
  type: "antidote" | "herbal" | "magical" | "surgical" | "rest" | "prayer";
  target_diseases: string[];
  target_poisons: string[];
  ingredients: CureIngredient[];
  preparation_time: number; // in minutes
  success_chance: number;
  side_effects: SideEffect[];
  skill_required: number;
}

interface CureIngredient {
  item_id: string;
  quantity: number;
  quality_requirement: number;
  optional: boolean;
  substitution?: string;
}
```

### Treatment Process

```typescript
interface Treatment {
  cure: Cure;
  patient: Character;
  healer: Character;
  healer_skill: number;
  environment: EnvironmentModifier;
  result: TreatmentResult;
}

interface TreatmentResult {
  success: boolean;
  cure_effectiveness: number; // 0-100%
  recovery_time: number; // in hours
  side_effects: SideEffect[];
  immunity_gained: boolean;
  skill_gained: number;
}
```

## Resistance System

### Resistance Factors

```typescript
interface DiseaseResistance {
  base: number; // from CON stat
  racial: number; // species resistance
  magical: number; // enchantments, buffs
  equipment: number; // gear bonuses
  immunity: string[]; // specific immunities
  tolerance: ToleranceMap; // built-up tolerance
}

interface ToleranceMap {
  [disease_id: string]: {
    exposure_count: number;
    resistance_bonus: number;
    immunity_chance: number;
  };
}
```

### Saving Throws

| Condition              | Save Type | DC Range |
| ---------------------- | --------- | -------- |
| **Disease Exposure**   | CON       | 10-25    |
| **Poison Ingestion**   | CON       | 10-30    |
| **Poison Contact**     | DEX       | 10-20    |
| **Magical Affliction** | WIS       | 15-30    |
| **Curse**              | CHA       | 15-25    |

## Alchemy Integration

### Antidote Crafting

```typescript
interface AntidoteRecipe {
  target: string; // disease or poison ID
  ingredients: AlchemyIngredient[];
  preparation: PreparationStep[];
  success_chance: number;
  potency: number;
  shelf_life: number; // in game days
}
```

### Poison Crafting

```typescript
interface PoisonRecipe {
  poison_id: string;
  ingredients: AlchemyIngredient[];
  preparation: PreparationStep[];
  potency_modifier: number;
  detection_difficulty: number;
  dosage_per_craft: number;
}
```

## Integration Points

- **RPG Mechanics** — CON, WIS stats affect resistance
- **Combat System** — Poison application on weapons
- **Alchemy System** — Antidote/poison crafting
- **NPC System** — NPC infection, symptoms
- **World & Locations** — Plague zones, toxic areas
- **Healing System** — Treatment mechanics

## Open Questions

- Should diseases be permanent or always curable?
- How to handle disease spread in populated areas?
- Should poison be too effective (game-breaking)?
- How to balance disease vs. player agency?
- Should there be pandemic mechanics?

## Files

- `src/rpg/disease/` — disease system
- `src/rpg/poison/` — poison system
- `src/rpg/disease/diseases.ts` — disease definitions
- `src/rpg/disease/progression.ts` — disease progression
- `src/rpg/disease/cures.ts` — cure system
- `src/rpg/poison/poisons.ts` — poison definitions
- `src/rpg/poison/application.ts` — poison application
- `src/rpg/resistance.ts` — resistance mechanics
- `src/db/schema-disease.ts` — disease tables
- `src/routes/disease.ts` — disease API

## Related Epics

- **Epic RPG Mechanics** — Stats, saving throws
- **Epic Alchemy** — Antidote/poison crafting
- **Epic Combat System** — Poison weapons
- **Epic NPC System** — NPC infection
- **Epic World & Locations** — Plague zones
