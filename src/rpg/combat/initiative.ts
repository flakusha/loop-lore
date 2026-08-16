// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { rollDice, } from "../dice.js";
import { abilityModifier, } from "../stats.js";
import { type Combatant, type InitiativeResult, } from "./types.js";

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
