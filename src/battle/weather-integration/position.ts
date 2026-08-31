// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { CoverType, Elevation, } from "./types";

/**
 * Calculate cover bonus to AC/defense
 * @param cover
 */
export function calculateCoverBonus(cover: CoverType,): number {
  switch (cover) {
    case "none": {
      return 0;
    }
    case "half": {
      return 2;
    }
    case "three_quarters": {
      return 5;
    }
    case "full": {
      return 10;
    }
  }
}

/**
 * Calculate elevation advantage
 * @param attackerElevation
 * @param targetElevation
 */
export function calculateElevationBonus(
  attackerElevation: Elevation,
  targetElevation: Elevation,
): { attackBonus: number; damageBonus: number } {
  const elevationOrder: Elevation[] = ["low", "medium", "high", "extreme",];
  const attackerIndex = elevationOrder.indexOf(attackerElevation,);
  const targetIndex = elevationOrder.indexOf(targetElevation,);

  const difference = attackerIndex - targetIndex;

  if (difference > 0) {
    // Attacker has elevation advantage
    return {
      attackBonus: difference * 2,
      damageBonus: difference * 1,
    };
  }
  if (difference < 0) {
    // Attacker has elevation disadvantage
    return {
      attackBonus: difference * 2,
      damageBonus: Math.min(0, difference,),
    };
  }

  return { attackBonus: 0, damageBonus: 0, };
}
