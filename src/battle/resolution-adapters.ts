/**
 * Backward-compatible adapters for battle resolution functions.
 *
 * The original `calculateAttackRoll`, `calculateDefenseRoll`, and
 * `processCombatRound` were removed during a merge. These thin wrappers
 * let existing route call-sites work without modification.
 *
 * @deprecated — new code should use makeAttackRoll / makeSavingThrow directly.
 */

import type { DiceRoll, RollModifier, } from "./integration-schemas";
import {
  type AttackRollResult,
  makeAttackRoll,
  makeSavingThrow,
} from "./resolution-integration";

function buildMods(advantage?: boolean, disadvantage?: boolean,): RollModifier[] {
  const mods: RollModifier[] = [];
  if (advantage) { mods.push({ source: "advantage", value: 2, type: "bonus", },); }
  if (disadvantage) { mods.push({ source: "disadvantage", value: -2, type: "penalty", },); }
  return mods;
}

/** @deprecated Use makeAttackRoll */
export function calculateAttackRoll(
  attackBonus: number,
  targetAC: number,
  advantage?: boolean,
  disadvantage?: boolean,
): AttackRollResult {
  return makeAttackRoll(attackBonus, targetAC, buildMods(advantage, disadvantage,),);
}

/** @deprecated Use makeSavingThrow */
export function calculateDefenseRoll(
  defenseBonus: number,
  incomingAttack: number,
  advantage?: boolean,
  disadvantage?: boolean,
): { roll: DiceRoll; success: boolean; margin: number } {
  return makeSavingThrow(
    defenseBonus,
    { name: "defense", value: incomingAttack, description: "Defense check", },
    buildMods(advantage, disadvantage,),
  );
}

/** @deprecated Removed from resolution-integration — stub */
export function processCombatRound(
  _combatants: { id: string; attackBonus: number; defenseBonus: number; maxHP: number }[],
  _currentHP: Record<string, number>,
) {
  return { round: 0, actions: [], summary: "Combat round processing not yet implemented", };
}
