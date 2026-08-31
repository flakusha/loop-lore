// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  DiceRoll,
  DifficultyClass,
  RollModifier,
} from "../integration-schemas";
import {
  rollDice,
} from "../integration-schemas";

/**
 * Make a saving throw
 * @param saveBonus
 * @param dc
 * @param modifiers
 */
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

/**
 * Make a skill check for combat
 * @param skillBonus
 * @param dc
 * @param modifiers
 */
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

/**
 * Make a concentration check
 * @param constitutionSave
 * @param damageTaken
 * @param dc
 */
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
