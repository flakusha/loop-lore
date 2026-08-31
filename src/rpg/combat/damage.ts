// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Combatant, } from "./types.js";

// ── Damage Application ──────────────────────────────────

/**
 * Apply damage to a combatant.
 * @param combatant
 * @param damage
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
 * @param combatant
 * @param amount
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
