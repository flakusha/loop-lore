// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type AdvantageMode, type DiceRollResult, rollDice, } from "../dice.js";
import { abilityModifier, proficiencyBonus, } from "../stats.js";
import { type Combatant, } from "./types.js";

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
