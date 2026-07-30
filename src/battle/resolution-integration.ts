/**
 * Resolution Integration for Battle
 *
 * Unified dice resolution, critical hits, and difficulty classes.
 */
import type {
  DiceRoll,
  DifficultyClass,
  RollModifier,
} from "./integration-schemas";
import {
  rollDice,
} from "./integration-schemas";

/** Attack roll result */
export interface AttackRollResult {
  /** The dice roll */
  roll: DiceRoll;
  /** Whether attack hit */
  hit: boolean;
  /** Whether critical hit */
  criticalHit: boolean;
  /** Whether critical miss */
  criticalMiss: boolean;
  /** Damage dealt (if hit) */
  damage?: DamageResult;
  /** Narration */
  narration: string;
}

/** Damage result */
export interface DamageResult {
  /** Base damage */
  baseDamage: number;
  /** Damage modifiers */
  modifiers: { source: string; value: number }[];
  /** Total damage */
  totalDamage: number;
  /** Damage type */
  type: "physical" | "magical" | "fire" | "ice" | "lightning" | "poison" | "healing";
  /** Whether damage was critical */
  wasCritical: boolean;
}

/** Make an attack roll */
export function makeAttackRoll(
  attackBonus: number,
  targetAC: number,
  modifiers: RollModifier[] = [],
  criticalThreshold = 20,
): AttackRollResult {
  const roll = rollDice("d20", 1, [
    { source: "attack", value: attackBonus, type: "bonus", },
    ...modifiers,
  ],);

  const hit = roll.criticalSuccess || (!roll.criticalFailure && roll.total >= targetAC);
  const criticalHit = roll.criticalSuccess || (roll.results[0] ?? 0) >= criticalThreshold;
  const criticalMiss = roll.criticalFailure;

  let narration: string;
  if (criticalHit) {
    narration = `Critical hit! Roll: ${roll.total} vs AC ${targetAC}`;
  } else if (criticalMiss) {
    narration = `Critical miss! Roll: ${roll.total} vs AC ${targetAC}`;
  } else if (hit) {
    narration = `Hit! Roll: ${roll.total} vs AC ${targetAC}`;
  } else {
    narration = `Miss! Roll: ${roll.total} vs AC ${targetAC}`;
  }

  return {
    roll,
    hit,
    criticalHit,
    criticalMiss,
    narration,
  };
}

/** Calculate damage */
export function calculateDamage(
  baseDamage: string, // e.g., "2d6+3"
  modifiers: { source: string; value: number }[] = [],
  isCritical = false,
  damageType: DamageResult["type"] = "physical",
): DamageResult {
  // Parse dice notation
  const match = /(\d+)d(\d+)(?:([+-]\d+))?/.exec(baseDamage,);
  if (!match) {
    return {
      baseDamage: 0,
      modifiers,
      totalDamage: 0,
      type: damageType,
      wasCritical: isCritical,
    };
  }

  const count = parseInt(match[1] ?? "1", 10,);
  const sides = parseInt(match[2] ?? "6", 10,);
  const bonus = match[3] ? parseInt(match[3], 10,) : 0;

  // Roll damage dice
  let baseDamageValue = 0;
  for (let i = 0; i < count; i++) {
    baseDamageValue += Math.floor(Math.random() * sides,) + 1;
  }
  baseDamageValue += bonus;

  // Critical doubles damage dice (not modifiers)
  if (isCritical) {
    baseDamageValue *= 2;
  }

  // Apply modifiers
  let totalDamage = baseDamageValue;
  for (const mod of modifiers) {
    totalDamage += mod.value;
  }

  // Minimum 1 damage
  totalDamage = Math.max(1, totalDamage,);

  return {
    baseDamage: baseDamageValue,
    modifiers,
    totalDamage,
    type: damageType,
    wasCritical: isCritical,
  };
}

/** Make a saving throw */
export function makeSavingThrow(
  saveBonus: number,
  dc: DifficultyClass,
  modifiers: RollModifier[] = [],
): {
  roll: DiceRoll;
  success: boolean;
  margin: number;
  narration: string;
} {
  const roll = rollDice("d20", 1, [
    { source: "save", value: saveBonus, type: "bonus", },
    ...modifiers,
  ],);

  const margin = roll.total - dc.value;
  const success = roll.criticalSuccess || (!roll.criticalFailure && margin >= 0);

  let narration: string;
  if (roll.criticalSuccess) {
    narration = `Critical save! Roll: ${roll.total} vs DC ${dc.value}`;
  } else if (roll.criticalFailure) {
    narration = `Critical fail! Roll: ${roll.total} vs DC ${dc.value}`;
  } else if (success) {
    narration = `Save succeeded! Roll: ${roll.total} vs DC ${dc.value}`;
  } else {
    narration = `Save failed! Roll: ${roll.total} vs DC ${dc.value}`;
  }

  return {
    roll,
    success,
    margin,
    narration,
  };
}

/** Make a skill check for combat */
export function makeCombatSkillCheck(
  skillBonus: number,
  dc: DifficultyClass,
  modifiers: RollModifier[] = [],
): {
  roll: DiceRoll;
  success: boolean;
  margin: number;
  criticalSuccess: boolean;
  criticalFailure: boolean;
  narration: string;
} {
  const roll = rollDice("d20", 1, [
    { source: "skill", value: skillBonus, type: "bonus", },
    ...modifiers,
  ],);

  const margin = roll.total - dc.value;
  const success = roll.criticalSuccess || (!roll.criticalFailure && margin >= 0);

  let narration: string;
  if (roll.criticalSuccess) {
    narration = `Critical success! Roll: ${roll.total} vs DC ${dc.value}`;
  } else if (roll.criticalFailure) {
    narration = `Critical failure! Roll: ${roll.total} vs DC ${dc.value}`;
  } else if (success) {
    narration = `Success! Roll: ${roll.total} vs DC ${dc.value}`;
  } else {
    narration = `Failure! Roll: ${roll.total} vs DC ${dc.value}`;
  }

  return {
    roll,
    success,
    margin,
    criticalSuccess: roll.criticalSuccess,
    criticalFailure: roll.criticalFailure,
    narration,
  };
}

/** Make an initiative roll */
export function makeInitiativeRoll(
  dexterity: number,
  modifiers: RollModifier[] = [],
): {
  roll: DiceRoll;
  initiative: number;
} {
  const roll = rollDice("d20", 1, [
    { source: "initiative", value: dexterity, type: "bonus", },
    ...modifiers,
  ],);

  return {
    roll,
    initiative: roll.total,
  };
}

/** Make a concentration check */
export function makeConcentrationCheck(
  constitutionSave: number,
  damageTaken: number,
  dc: DifficultyClass,
): {
  roll: DiceRoll;
  success: boolean;
  narration: string;
} {
  // DC is 10 or half damage taken, whichever is higher
  const actualDC = Math.max(dc.value, Math.floor(damageTaken / 2,),);

  const roll = rollDice("d20", 1, [
    { source: "concentration", value: constitutionSave, type: "bonus", },
  ],);

  const success = roll.criticalSuccess || (!roll.criticalFailure && roll.total >= actualDC);

  const narration = success
    ? `Concentration maintained! Roll: ${roll.total} vs DC ${actualDC}`
    : `Concentration broken! Roll: ${roll.total} vs DC ${actualDC}`;

  return {
    roll,
    success,
    narration,
  };
}

/** Make a death saving throw */
export function makeDeathSavingThrow(): {
  roll: DiceRoll;
  success: boolean;
  criticalSuccess: boolean;
  criticalFailure: boolean;
  narration: string;
} {
  const roll = rollDice("d20", 1,);

  const success = roll.criticalSuccess || (!roll.criticalFailure && roll.total >= 10);
  const criticalSuccess = roll.criticalSuccess;
  const criticalFailure = roll.criticalFailure;

  let narration: string;
  if (roll.criticalSuccess) {
    narration = "Death save critical success! Stabilized with 1 HP!";
  } else if (roll.criticalFailure) {
    narration = "Death save critical failure! Two failures!";
  } else if (success) {
    narration = `Death save succeeded! Roll: ${roll.total}`;
  } else {
    narration = `Death save failed! Roll: ${roll.total}`;
  }

  return {
    roll,
    success,
    criticalSuccess,
    criticalFailure,
    narration,
  };
}

/** Get DC for common combat actions */
export function getCombatDC(
  action: "disarm" | "shove" | "grapple" | "escape_grapple" | "aim",
  targetLevel = 10,
): DifficultyClass {
  switch (action) {
    case "disarm": {
      return {
        name: "Disarm",
        value: 10 + targetLevel,
        description: "DC to disarm opponent",
      };
    }
    case "shove": {
      return {
        name: "Shove",
        value: 10 + Math.floor(targetLevel / 2,),
        description: "DC to shove opponent",
      };
    }
    case "grapple": {
      return {
        name: "Grapple",
        value: 10 + targetLevel,
        description: "DC to grapple opponent",
      };
    }
    case "escape_grapple": {
      return {
        name: "Escape Grapple",
        value: 10 + Math.floor(targetLevel / 2,),
        description: "DC to escape grapple",
      };
    }
    case "aim": {
      return {
        name: "Aim",
        value: 10 + targetLevel,
        description: "DC to aim for weak spot",
      };
    }
  }
}
