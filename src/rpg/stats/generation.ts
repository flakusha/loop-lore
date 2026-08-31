// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { rollDie, } from "../dice";
import {
  type AbilityName,
  ALL_ABILITIES,
  type StatBlock,
} from "./types.js";

// ── Stat generation methods ──────────────────────────────

/** Point-buy costs: stat value → cost in points */
const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

/**
 * Standard point-buy stat generation (27 points).
 * Each stat starts at 8, player allocates points (max 15 per stat).
 * @param allocation - Points to allocate above 8 for each ability
 * @returns Stat block, or null if allocation is invalid
 */
export function pointBuy(allocation: Record<AbilityName, number>,): StatBlock | null {
  let totalCost = 0;
  const stats: Record<string, number> = {};

  for (const ability of ALL_ABILITIES) {
    const above8 = allocation[ability] ?? 0;
    const statValue = 8 + above8;

    if (statValue < 8 || statValue > 15) {
      return null;
    }

    const cost = POINT_BUY_COST[statValue];
    if (cost === undefined) {
      return null;
    }
    totalCost += cost;
    stats[ability] = statValue;
  }

  if (totalCost !== 27) {
    return null;
  }

  return stats as unknown as StatBlock;
}

/**
 * Roll stats using 4d6-drop-lowest method.
 * Roll 4d6, drop the lowest die, sum the remaining 3.
 * Repeated 6 times for each ability.
 * @returns Array of 6 stat values (sorted highest to lowest)
 */
export function rollStats4d6(): number[] {
  const stats: number[] = [];

  for (let i = 0; i < 6; i++) {
    const rolls: number[] = [];
    for (let j = 0; j < 4; j++) {
      rolls.push(rollDie(6,),);
    }
    rolls.sort((a, b,) => b - a);
    stats.push(rolls[0]! + rolls[1]! + rolls[2]!,);
  }

  stats.sort((a, b,) => b - a);
  return stats;
}

/**
 * Roll stats using standard array (15, 14, 13, 12, 10, 8).
 * Returns the standard array for assignment.
 */
export function standardArray(): number[] {
  return [15, 14, 13, 12, 10, 8,];
}

/**
 * Create a stat block from an array of 6 values assigned to abilities in order.
 * @param values
 */
export function statBlockFromArray(values: number[],): StatBlock {
  return {
    str: values[0] ?? 10,
    dex: values[1] ?? 10,
    con: values[2] ?? 10,
    int: values[3] ?? 10,
    wis: values[4] ?? 10,
    cha: values[5] ?? 10,
  };
}
