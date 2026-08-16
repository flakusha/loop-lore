// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { MoraleState, } from "../integration-schemas";

/** Calculate surrender chance */
export function calculateSurrenderChance(
  targetMorale: MoraleState,
  attackerReputation: number,
  targetHealthPercent: number,
): { surrenderChance: number; canSurrender: boolean } {
  // Can't surrender if morale is too high
  if (targetMorale.value > 30) {
    return { surrenderChance: 0, canSurrender: false, };
  }

  // Calculate surrender chance based on morale and health
  let chance = 0;

  // Low morale increases surrender chance
  chance += (30 - targetMorale.value) * 2;

  // Low health increases surrender chance
  chance += (100 - targetHealthPercent) * 0.5;

  // High attacker reputation increases surrender chance
  chance += attackerReputation * 0.3;

  // Cap at 90%
  chance = Math.min(90, Math.max(0, chance,),);

  return {
    surrenderChance: Math.round(chance,),
    canSurrender: true,
  };
}
