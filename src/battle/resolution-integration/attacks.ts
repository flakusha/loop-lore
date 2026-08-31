// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { parseIntOr, } from "../../utils/parse-number";
import type {
  RollModifier,
} from "../integration-schemas";
import {
  rollDice,
} from "../integration-schemas";
import type {
  AttackRollResult,
  DamageResult,
} from "./types";

/**
 * Make an attack roll
 * @param attackBonus
 * @param targetAC
 * @param modifiers
 * @param criticalThreshold
 */
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

/**
 * Calculate damage
 * @param baseDamage
 * @param modifiers
 * @param isCritical
 * @param damageType
 */
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

  const count = match[1] ? parseIntOr(match[1], 1,) : 1;
  const sides = match[2] ? parseIntOr(match[2], 6,) : 6;
  const bonus = match[3] ? parseIntOr(match[3], 0,) : 0;

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
