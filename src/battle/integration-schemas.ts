/**
 * Battle Integration Schemas
 *
 * Shared types for cross-system integration between Battle, Items, Social,
 * NPC, Weather, and Resolution systems. These schemas define the data
 * contracts that enable these systems to work together.
 */

// ── Combat Stats (Shared: Character Core, Items, Battle) ─────

/** Core combat statistics for a character/NPC */
export interface CombatStats {
  /** Character ID */
  characterId: string;
  /** Health points */
  health: number;
  /** Maximum health */
  maxHealth: number;
  /** Mana points */
  mana: number;
  /** Maximum mana */
  maxMana: number;
  /** Stamina points */
  stamina: number;
  /** Maximum stamina */
  maxStamina: number;
  /** Physical attack power */
  attack: number;
  /** Physical defense */
  defense: number;
  /** Magical attack power */
  magicAttack: number;
  /** Magical defense */
  magicDefense: number;
  /** Speed/agility */
  speed: number;
  /** Critical hit chance (0-100) */
  criticalChance: number;
  /** Dodge chance (0-100) */
  dodgeChance: number;
  /** Accuracy (0-100) */
  accuracy: number;
}

/** Equipment slot types */
export type EquipmentSlot =
  | "weapon"
  | "armor"
  | "helmet"
  | "boots"
  | "gloves"
  | "accessory"
  | "shield"
  | "ring"
  | "necklace";

/** Equipment stat modifier */
export interface EquipmentModifier {
  /** Stat being modified */
  stat: keyof CombatStats;
  /** Modifier value (positive = bonus, negative = penalty) */
  value: number;
  /** Condition for modifier to apply (optional) */
  condition?: string;
}

/** Calculate effective combat stats with equipment modifiers */
export function calculateEffectiveStats(
  baseStats: CombatStats,
  modifiers: EquipmentModifier[],
): CombatStats {
  const effective = { ...baseStats, };

  for (const mod of modifiers) {
    if (mod.stat === "characterId") { continue; // Skip non-numeric fields
     }
    const currentValue = effective[mod.stat];
    if (typeof currentValue === "number") {
      (effective as Record<string, unknown>)[mod.stat] = currentValue + mod.value;
    }
  }

  // Clamp values
  effective.health = Math.max(0, Math.min(effective.maxHealth, effective.health,),);
  effective.mana = Math.max(0, Math.min(effective.maxMana, effective.mana,),);
  effective.stamina = Math.max(0, Math.min(effective.maxStamina, effective.stamina,),);
  effective.criticalChance = Math.max(0, Math.min(100, effective.criticalChance,),);
  effective.dodgeChance = Math.max(0, Math.min(100, effective.dodgeChance,),);
  effective.accuracy = Math.max(0, Math.min(100, effective.accuracy,),);

  return effective;
}

// ── Morale State (Shared: Social, Battle) ─────────────────────

/** Morale level */
export type MoraleLevel = "broken" | "shaken" | "steady" | "confident" | "inspired";

/** Morale state for a combatant */
export interface MoraleState {
  /** Character ID */
  characterId: string;
  /** Current morale value (0-100) */
  value: number;
  /** Computed morale level */
  level: MoraleLevel;
  /** Morale modifiers active */
  modifiers: MoraleModifier[];
  /** When morale was last updated */
  lastUpdated: string;
}

/** Morale modifier */
export interface MoraleModifier {
  /** What caused this modifier */
  reason: string;
  /** Value change */
  value: number;
  /** Duration in turns (0 = permanent) */
  duration: number;
  /** When this modifier was applied */
  appliedAt: string;
}

/** Compute morale level from value */
export function computeMoraleLevel(value: number,): MoraleLevel {
  if (value <= 20) { return "broken"; }
  if (value <= 40) { return "shaken"; }
  if (value <= 60) { return "steady"; }
  if (value <= 80) { return "confident"; }
  return "inspired";
}

/** Create initial morale state */
export function createMoraleState(
  characterId: string,
  initialValue = 50,
): MoraleState {
  return {
    characterId,
    value: Math.max(0, Math.min(100, initialValue,),),
    level: computeMoraleLevel(initialValue,),
    modifiers: [],
    lastUpdated: new Date().toISOString(),
  };
}

/** Apply morale modifier */
export function applyMoraleModifier(
  state: MoraleState,
  modifier: MoraleModifier,
): MoraleState {
  const newValue = Math.max(0, Math.min(100, state.value + modifier.value,),);
  return {
    ...state,
    value: newValue,
    level: computeMoraleLevel(newValue,),
    modifiers: [...state.modifiers, modifier,],
    lastUpdated: new Date().toISOString(),
  };
}

// ── Environmental Modifier (Shared: Weather, Battle) ──────────

/** Weather condition affecting combat */
export type CombatWeather =
  | "clear"
  | "rain"
  | "storm"
  | "snow"
  | "fog"
  | "wind"
  | "heatwave"
  | "cold_snap";

/** Terrain type affecting combat */
export type TerrainType =
  | "open"
  | "forest"
  | "mountain"
  | "swamp"
  | "desert"
  | "urban"
  | "dungeon"
  | "underwater";

/** Environmental modifier for combat */
export interface EnvironmentalModifier {
  /** Modifier ID */
  id: string;
  /** Source of modifier (weather, terrain, hazard) */
  source: "weather" | "terrain" | "hazard";
  /** What stat is affected */
  affectedStat: string;
  /** Modifier value */
  value: number;
  /** Whether this is a percentage modifier */
  isPercentage: boolean;
  /** Duration in turns (0 = permanent for encounter) */
  duration: number;
  /** Description of the effect */
  description: string;
}

/** Get weather modifiers for combat */
export function getCombatWeatherModifiers(
  weather: CombatWeather,
): EnvironmentalModifier[] {
  const modifiers: EnvironmentalModifier[] = [];

  switch (weather) {
    case "rain": {
      modifiers.push({
        id: "rain_accuracy",
        source: "weather",
        affectedStat: "accuracy",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Rain reduces accuracy",
      }, {
        id: "rain_fire",
        source: "weather",
        affectedStat: "magicAttack",
        value: -20,
        isPercentage: true,
        duration: 0,
        description: "Rain weakens fire magic",
      },);
      break;
    }
    case "storm": {
      modifiers.push({
        id: "storm_accuracy",
        source: "weather",
        affectedStat: "accuracy",
        value: -20,
        isPercentage: false,
        duration: 0,
        description: "Storm greatly reduces accuracy",
      }, {
        id: "storm_speed",
        source: "weather",
        affectedStat: "speed",
        value: -15,
        isPercentage: false,
        duration: 0,
        description: "Storm hampers movement",
      },);
      break;
    }
    case "fog": {
      modifiers.push({
        id: "fog_accuracy",
        source: "weather",
        affectedStat: "accuracy",
        value: -15,
        isPercentage: false,
        duration: 0,
        description: "Fog reduces visibility",
      }, {
        id: "fog_dodge",
        source: "weather",
        affectedStat: "dodgeChance",
        value: 10,
        isPercentage: false,
        duration: 0,
        description: "Fog provides concealment",
      },);
      break;
    }
    case "wind": {
      modifiers.push({
        id: "wind_ranged",
        source: "weather",
        affectedStat: "accuracy",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Wind affects ranged attacks",
      },);
      break;
    }
    case "heatwave": {
      modifiers.push({
        id: "heat_stamina",
        source: "weather",
        affectedStat: "stamina",
        value: -20,
        isPercentage: true,
        duration: 0,
        description: "Heat drains stamina faster",
      },);
      break;
    }
    case "cold_snap": {
      modifiers.push({
        id: "cold_speed",
        source: "weather",
        affectedStat: "speed",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Cold slows movement",
      }, {
        id: "cold_attack",
        source: "weather",
        affectedStat: "attack",
        value: -5,
        isPercentage: false,
        duration: 0,
        description: "Cold stiffens muscles",
      },);
      break;
    }
  }

  return modifiers;
}

/** Get terrain modifiers for combat */
export function getCombatTerrainModifiers(
  terrain: TerrainType,
): EnvironmentalModifier[] {
  const modifiers: EnvironmentalModifier[] = [];

  switch (terrain) {
    case "forest": {
      modifiers.push({
        id: "forest_dodge",
        source: "terrain",
        affectedStat: "dodgeChance",
        value: 15,
        isPercentage: false,
        duration: 0,
        description: "Trees provide cover",
      }, {
        id: "forest_ranged",
        source: "terrain",
        affectedStat: "accuracy",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Trees obstruct ranged attacks",
      },);
      break;
    }
    case "mountain": {
      modifiers.push({
        id: "mountain_defense",
        source: "terrain",
        affectedStat: "defense",
        value: 10,
        isPercentage: false,
        duration: 0,
        description: "High ground advantage",
      }, {
        id: "mountain_speed",
        source: "terrain",
        affectedStat: "speed",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Difficult terrain",
      },);
      break;
    }
    case "swamp": {
      modifiers.push({
        id: "swamp_speed",
        source: "terrain",
        affectedStat: "speed",
        value: -20,
        isPercentage: false,
        duration: 0,
        description: "Boggy terrain slows movement",
      }, {
        id: "swamp_dodge",
        source: "terrain",
        affectedStat: "dodgeChance",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Limited maneuverability",
      },);
      break;
    }
    case "underwater": {
      modifiers.push({
        id: "water_speed",
        source: "terrain",
        affectedStat: "speed",
        value: -30,
        isPercentage: false,
        duration: 0,
        description: "Water resistance",
      }, {
        id: "water_magic",
        source: "terrain",
        affectedStat: "magicAttack",
        value: 20,
        isPercentage: true,
        duration: 0,
        description: "Water amplifies ice/water magic",
      },);
      break;
    }
  }

  return modifiers;
}

// ── Resolution Roll (Shared: Battle, Social, Magic, RPG) ──────

/** Dice type */
export type DiceType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";

/** Dice roll result */
export interface DiceRoll {
  /** Type of dice */
  type: DiceType;
  /** Number of dice rolled */
  count: number;
  /** Individual results */
  results: number[];
  /** Total after modifiers */
  total: number;
  /** Whether this was a critical success */
  criticalSuccess: boolean;
  /** Whether this was a critical failure */
  criticalFailure: boolean;
  /** Modifiers applied */
  modifiers: RollModifier[];
}

/** Roll modifier */
export interface RollModifier {
  /** Source of modifier */
  source: string;
  /** Value */
  value: number;
  /** Whether this is advantage/disadvantage */
  type: "bonus" | "penalty" | "advantage" | "disadvantage";
}

/** Difficulty class */
export interface DifficultyClass {
  /** DC name */
  name: string;
  /** DC value */
  value: number;
  /** Description */
  description: string;
}

/** Standard difficulty classes */
export const STANDARD_DC: Record<string, DifficultyClass> = {
  trivial: { name: "Trivial", value: 5, description: "Almost anyone can do this", },
  easy: { name: "Easy", value: 10, description: "No training needed", },
  medium: { name: "Medium", value: 15, description: "Requires some skill", },
  hard: { name: "Hard", value: 20, description: "Requires expertise", },
  very_hard: { name: "Very Hard", value: 25, description: "Near impossible", },
  legendary: { name: "Legendary", value: 30, description: "Only legends succeed", },
};

/** Roll a dice */
export function rollDice(
  type: DiceType,
  count = 1,
  modifiers: RollModifier[] = [],
): DiceRoll {
  const sides = parseInt(type.slice(1,), 10,);
  const results: number[] = [];

  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * sides,) + 1,);
  }

  let total = results.reduce((sum, r,) => sum + r, 0,);

  // Apply modifiers
  for (const mod of modifiers) {
    if (mod.type === "bonus" || mod.type === "penalty") {
      total += mod.value;
    }
  }

  // Check for advantage/disadvantage (roll twice, take higher/lower)
  const hasAdvantage = modifiers.some(m => m.type === "advantage");
  const hasDisadvantage = modifiers.some(m => m.type === "disadvantage");

  if (hasAdvantage && !hasDisadvantage) {
    const advantageResults: number[] = [];
    for (let i = 0; i < count; i++) {
      advantageResults.push(Math.floor(Math.random() * sides,) + 1,);
    }
    const advTotal = advantageResults.reduce((sum, r,) => sum + r, 0,);
    if (advTotal > total) {
      total = advTotal;
      results.push(...advantageResults,);
    }
  } else if (hasDisadvantage && !hasAdvantage) {
    const disadvantageResults: number[] = [];
    for (let i = 0; i < count; i++) {
      disadvantageResults.push(Math.floor(Math.random() * sides,) + 1,);
    }
    const disTotal = disadvantageResults.reduce((sum, r,) => sum + r, 0,);
    if (disTotal < total) {
      total = disTotal;
      results.push(...disadvantageResults,);
    }
  }

  // Check critical success/failure (d20 only)
  const naturalRoll = results[0] ?? 0;
  const criticalSuccess = type === "d20" && naturalRoll === 20;
  const criticalFailure = type === "d20" && naturalRoll === 1;

  return {
    type,
    count,
    results,
    total: Math.max(0, total,),
    criticalSuccess,
    criticalFailure,
    modifiers,
  };
}

/** Make a skill check */
export function makeSkillCheck(
  skillBonus: number,
  dc: DifficultyClass,
  modifiers: RollModifier[] = [],
): {
  roll: DiceRoll;
  success: boolean;
  margin: number;
  criticalSuccess: boolean;
  criticalFailure: boolean;
} {
  const roll = rollDice("d20", 1, [
    { source: "skill", value: skillBonus, type: "bonus", },
    ...modifiers,
  ],);

  const margin = roll.total - dc.value;
  const success = roll.criticalSuccess || (!roll.criticalFailure && margin >= 0);

  return {
    roll,
    success,
    margin,
    criticalSuccess: roll.criticalSuccess,
    criticalFailure: roll.criticalFailure,
  };
}

// ── Status Effect (Shared: RPG, Magic, Disease, Social) ───────

/** Status effect type */
export type StatusEffectType =
  | "buff"
  | "debuff"
  | "dot" // damage over time
  | "hot" // heal over time
  | "control"
  | "special";

/** Status effect */
export interface StatusEffect {
  /** Effect ID */
  id: string;
  /** Effect name */
  name: string;
  /** Effect type */
  type: StatusEffectType;
  /** What stat is affected */
  affectedStat: string;
  /** Modifier value */
  value: number;
  /** Duration in turns */
  duration: number;
  /** Remaining turns */
  remainingTurns: number;
  /** Whether this effect can be dispelled */
  dispellable: boolean;
  /** Stack count (for stackable effects) */
  stackCount: number;
  /** Maximum stacks */
  maxStacks: number;
  /** Description */
  description: string;
}

/** Create a status effect */
export function createStatusEffect(
  name: string,
  type: StatusEffectType,
  affectedStat: string,
  value: number,
  duration: number,
  options: Partial<Omit<StatusEffect, "id" | "name" | "type" | "affectedStat" | "value" | "duration">> = {},
): StatusEffect {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    affectedStat,
    value,
    duration,
    remainingTurns: duration,
    dispellable: options.dispellable ?? true,
    stackCount: options.stackCount ?? 1,
    maxStacks: options.maxStacks ?? 1,
    description: options.description ?? `${name}: ${value} to ${affectedStat} for ${duration} turns`,
  };
}

/** Tick a status effect (reduce duration) */
export function tickStatusEffect(effect: StatusEffect,): StatusEffect | null {
  const remaining = effect.remainingTurns - 1;
  if (remaining <= 0) { return null; }
  return { ...effect, remainingTurns: remaining, };
}

/** Check if status effect is expired */
export function isStatusEffectExpired(effect: StatusEffect,): boolean {
  return effect.remainingTurns <= 0;
}
