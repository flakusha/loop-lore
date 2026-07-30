/**
 * RPG Combat Engine
 *
 * Initiative, attack rolls, damage calculation, armor class,
 * and action economy (bonus actions, reactions, free actions).
 */

import {
  type AdvantageMode,
  type DiceRollResult,
  type DiceSides,
  rollDice,
} from "./dice.js";
import {
  abilityModifier,
  proficiencyBonus,
  type StatBlock,
} from "./stats.js";

// ── Types ────────────────────────────────────────────────

/** Combatant in a fight */
export interface Combatant {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Current HP */
  hp: number;
  /** Maximum HP */
  maxHp: number;
  /** Armor class */
  ac: number;
  /** Ability scores */
  stats: StatBlock;
  /** Character level (for proficiency bonus) */
  level: number;
  /** Whether this combatant is an NPC/enemy */
  isNpc: boolean;
  /** Initiative score (set at combat start) */
  initiative: number;
  /** Initiative modifier (DEX mod) */
  initiativeMod: number;
  /** Whether this combatant has acted this round */
  hasActed: boolean;
  /** Actions remaining this turn */
  actions: number;
  /** Bonus actions remaining */
  bonusActions: number;
  /** Reactions available */
  reactions: number;
  /** Conditions (e.g. "stunned", "frightened") */
  conditions: string[];
}

/** Action types in combat */
export type ActionType =
  | "attack"
  | "cast_spell"
  | "use_item"
  | "dash"
  | "disengage"
  | "dodge"
  | "help"
  | "hide"
  | "ready"
  | "grapple"
  | "shove"
  | "bonus_action"
  | "reaction"
  | "free_action";

/** Result of an attack roll */
export interface AttackResult {
  /** The attack roll */
  roll: DiceRollResult;
  /** Total attack value (roll + STR/DEX mod + proficiency) */
  total: number;
  /** Whether the attack hits */
  hit: boolean;
  /** Whether it's a critical hit (natural 20) */
  criticalHit: boolean;
  /** Whether it's a critical miss (natural 1) */
  criticalMiss: boolean;
  /** Damage dealt (null if miss) */
  damage: DamageResult | null;
  /** Narration of the attack */
  narration: string;
}

/** Damage calculation result */
export interface DamageResult {
  /** Base weapon/spell damage dice */
  baseDice: DiceRollResult;
  /** Ability modifier added to damage */
  abilityMod: number;
  /** Additional flat damage (e.g. from features) */
  flatBonus: number;
  /** Total damage before resistance/vulnerability */
  totalBeforeResist: number;
  /** Final damage after resistances */
  finalDamage: number;
  /** Damage type */
  damageType: DamageType;
  /** Whether this was critical damage (extra dice) */
  isCritical: boolean;
}

/** Damage types */
export type DamageType =
  | "physical"
  | "fire"
  | "ice"
  | "lightning"
  | "thunder"
  | "poison"
  | "acid"
  | "psychic"
  | "necrotic"
  | "radiant"
  | "force"
  | "healing";

/** Damage resistance/vulnerability */
export interface DamageResistance {
  type: DamageType;
  /** "resistant" = half damage, "vulnerable" = double, "immune" = zero */
  modifier: "resistant" | "vulnerable" | "immune";
}

/** Initiative roll result */
export interface InitiativeResult {
  /** The d20 roll */
  roll: number;
  /** DEX modifier */
  dexMod: number;
  /** Total initiative score */
  total: number;
}

/** Combat round result */
export interface RoundResult {
  /** Round number */
  round: number;
  /** Initiative order for this round */
  initiativeOrder: string[];
  /** Actions taken this round */
  actions: CombatAction[];
  /** Whether combat is over */
  combatOver: boolean;
  /** Winner (if combat ended) */
  winner: "player" | "enemy" | null;
}

/** Action taken in combat */
export interface CombatAction {
  /** Actor ID */
  actorId: string;
  /** Action type */
  type: ActionType;
  /** Target ID (if any) */
  targetId?: string;
  /** Attack result (if attack action) */
  attack?: AttackResult;
  /** Damage dealt */
  damage?: number;
  /** Description */
  description: string;
}

// ── Initiative ───────────────────────────────────────────

/**
 * Roll initiative for a combatant.
 * d20 + DEX modifier.
 */
export function rollInitiative(combatant: Combatant,): InitiativeResult {
  const dexMod = abilityModifier(combatant.stats.dex,);
  const result = rollDice(20, 1, dexMod,);
  return {
    roll: result.rawTotal,
    dexMod,
    total: result.total,
  };
}

/**
 * Sort combatants by initiative (highest first).
 * Ties broken by DEX score (higher goes first).
 */
export function sortByInitiative(combatants: Combatant[],): Combatant[] {
  return [...combatants,].sort((a, b,) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    return b.stats.dex - a.stats.dex;
  },);
}

// ── Attack Rolls ────────────────────────────────────────

/**
 * Make an attack roll.
 *
 * @param attacker - The attacking combatant
 * @param target - The target combatant
 * @param attackAbility - Which ability to use ("str" for melee, "dex" for ranged)
 * @param damageDice - Weapon/spell damage dice (e.g. [8, 6] for 2d6)
 * @param damageSides - Sides on damage dice
 * @param damageType - Type of damage
 * @param extraDamage - Additional flat damage from features
 * @param resistances - Target's damage resistances
 * @param advantage - Advantage mode for the attack roll
 */
export function makeAttackRoll(
  attacker: Combatant,
  target: Combatant,
  attackAbility: "str" | "dex",
  damageDice: number,
  damageSides: DiceSides,
  damageType: DamageType = "physical",
  extraDamage = 0,
  resistances: DamageResistance[] = [],
  advantage: AdvantageMode = "normal",
): AttackResult {
  const abilityMod = abilityModifier(attacker.stats[attackAbility],);
  const profBonus = proficiencyBonus(attacker.level,);

  // Attack roll: d20 + ability mod + proficiency
  const attackRoll = rollDice(20, 1, abilityMod + profBonus, advantage,);
  const total = attackRoll.total;

  const criticalHit = attackRoll.natural20;
  const criticalMiss = attackRoll.natural1;
  const hit = criticalHit || (!criticalMiss && total >= target.ac);

  if (!hit) {
    return {
      roll: attackRoll,
      total,
      hit: false,
      criticalHit: false,
      criticalMiss,
      damage: null,
      narration: criticalMiss
        ? `${attacker.name} critically misses ${target.name}!`
        : `${attacker.name} misses ${target.name} (AC ${target.ac}).`,
    };
  }

  // Damage roll
  const actualDamageDice = damageDice * (criticalHit ? 2 : 1);
  const damageRoll = rollDice(damageSides, actualDamageDice,);

  const abilityDmgMod = abilityModifier(attacker.stats[attackAbility],);

  const totalBeforeResist = damageRoll.total + abilityDmgMod + extraDamage;

  // Apply resistances
  let finalDamage = totalBeforeResist;
  for (const res of resistances) {
    if (res.type === damageType) {
      switch (res.modifier) {
        case "resistant": {
          finalDamage = Math.floor(finalDamage / 2,);
          break;
        }
        case "vulnerable": {
          finalDamage *= 2;
          break;
        }
        case "immune": {
          finalDamage = 0;
          break;
        }
      }
    }
  }

  finalDamage = Math.max(0, finalDamage,);

  const narration = criticalHit
    ? `${attacker.name} critically hits ${target.name} for ${finalDamage} ${damageType} damage!`
    : `${attacker.name} hits ${target.name} for ${finalDamage} ${damageType} damage.`;

  return {
    roll: attackRoll,
    total,
    hit: true,
    criticalHit,
    criticalMiss: false,
    damage: {
      baseDice: damageRoll,
      abilityMod: abilityDmgMod,
      flatBonus: extraDamage,
      totalBeforeResist,
      finalDamage,
      damageType,
      isCritical: criticalHit,
    },
    narration,
  };
}

// ── Saving Throws ───────────────────────────────────────

/**
 * Make a saving throw.
 *
 * @param combatant - The combatant making the save
 * @param ability - Which ability to save with
 * @param dc - Difficulty class to beat
 * @param advantage - Advantage mode
 */
export function makeSavingThrow(
  combatant: Combatant,
  ability: "str" | "dex" | "con" | "int" | "wis" | "cha",
  dc: number,
  advantage: AdvantageMode = "normal",
): {
  roll: DiceRollResult;
  total: number;
  success: boolean;
  abilityMod: number;
} {
  const abilityMod = abilityModifier(combatant.stats[ability],);
  const profBonus = proficiencyBonus(combatant.level,);
  const roll = rollDice(20, 1, abilityMod + profBonus, advantage,);

  return {
    roll,
    total: roll.total,
    success: roll.total >= dc,
    abilityMod,
  };
}

// ── Action Economy ──────────────────────────────────────

/** Actions allowed per turn at level 1 */
const BASE_ACTIONS = 1;
const BASE_BONUS_ACTIONS = 1;
const BASE_REACTIONS = 1;

/**
 * Initialize a combatant for combat.
 */
export function initCombatant(
  id: string,
  name: string,
  stats: StatBlock,
  level: number,
  hp: number,
  ac: number,
  isNpc: boolean,
): Combatant {
  return {
    id,
    name,
    hp,
    maxHp: hp,
    ac,
    stats,
    level,
    isNpc,
    initiative: 0,
    initiativeMod: abilityModifier(stats.dex,),
    hasActed: false,
    actions: BASE_ACTIONS,
    bonusActions: BASE_BONUS_ACTIONS,
    reactions: BASE_REACTIONS,
    conditions: [],
  };
}

/**
 * Check if a combatant can take a specific action type.
 */
export function canTakeAction(combatant: Combatant, type: ActionType,): boolean {
  if (combatant.conditions.includes("stunned",) || combatant.conditions.includes("paralyzed",)) {
    return false;
  }

  switch (type) {
    case "reaction": {
      return combatant.reactions > 0;
    }
    case "bonus_action": {
      return combatant.bonusActions > 0;
    }
    case "free_action": {
      return true;
    }
    default: {
      return combatant.actions > 0;
    }
  }
}

/**
 * Consume an action from a combatant.
 */
export function consumeAction(combatant: Combatant, type: ActionType,): Combatant {
  const updated = { ...combatant, };

  switch (type) {
    case "reaction": {
      updated.reactions = Math.max(0, updated.reactions - 1,);
      break;
    }
    case "bonus_action": {
      updated.bonusActions = Math.max(0, updated.bonusActions - 1,);
      break;
    }
    case "free_action": {
      break;
    }
    default: {
      updated.actions = Math.max(0, updated.actions - 1,);
      updated.hasActed = true;
      break;
    }
  }

  return updated;
}

/**
 * Reset combatant's actions for a new turn.
 */
export function resetTurnActions(combatant: Combatant,): Combatant {
  return {
    ...combatant,
    actions: BASE_ACTIONS,
    bonusActions: BASE_BONUS_ACTIONS,
    hasActed: false,
  };
}

/**
 * Reset reactions for a new round (start of turn cycle).
 */
export function resetRoundReactions(combatants: Combatant[],): Combatant[] {
  return combatants.map((c,) => ({ ...c, reactions: BASE_REACTIONS, }));
}

// ── Damage Application ──────────────────────────────────

/**
 * Apply damage to a combatant.
 */
export function applyDamage(
  combatant: Combatant,
  damage: number,
): {
  updated: Combatant;
  overkill: number;
  defeated: boolean;
} {
  const overkill = Math.max(0, damage - combatant.hp,);
  const newHp = Math.max(0, combatant.hp - damage,);

  return {
    updated: { ...combatant, hp: newHp, },
    overkill,
    defeated: newHp === 0,
  };
}

/**
 * Heal a combatant (cannot exceed max HP).
 */
export function healCombatant(
  combatant: Combatant,
  amount: number,
): Combatant {
  return {
    ...combatant,
    hp: Math.min(combatant.maxHp, combatant.hp + amount,),
  };
}

// ── Condition Checks ────────────────────────────────────

/**
 * Check if a combatant is incapacitated (can't take actions).
 */
export function isIncapacitated(combatant: Combatant,): boolean {
  return combatant.conditions.some((c,) => ["stunned", "paralyzed", "unconscious", "petrified",].includes(c,));
}

/**
 * Check if a combatant is dead (0 HP).
 */
export function isDead(combatant: Combatant,): boolean {
  return combatant.hp <= 0;
}

/**
 * Check if combat is over (all of one side is defeated).
 */
export function isCombatOver(combatants: Combatant[],): {
  over: boolean;
  winner: "player" | "enemy" | null;
} {
  const alive = combatants.filter((c,) => c.hp > 0);
  const players = alive.filter((c,) => !c.isNpc);
  const enemies = alive.filter((c,) => c.isNpc);

  if (players.length === 0) {
    return { over: true, winner: "enemy", };
  }
  if (enemies.length === 0) {
    return { over: true, winner: "player", };
  }
  return { over: false, winner: null, };
}
