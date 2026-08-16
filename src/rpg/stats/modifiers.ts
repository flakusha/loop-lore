// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  type AbilityName,
  type StatBlock,
  type StatBlockWithModifiers,
} from "./types.js";

// ── Modifier calculation ─────────────────────────────────

/**
 * Calculate ability modifier from stat value.
 * Formula: floor((stat - 10) / 2)
 *
 * @param stat - Ability score (1–30)
 * @returns Modifier (can be negative)
 */
export function abilityModifier(stat: number,): number {
  return Math.floor((stat - 10) / 2,);
}

/**
 * Compute all modifiers from a stat block.
 */
export function computeModifiers(stats: StatBlock,): StatBlockWithModifiers {
  return {
    ...stats,
    strMod: abilityModifier(stats.str,),
    dexMod: abilityModifier(stats.dex,),
    conMod: abilityModifier(stats.con,),
    intMod: abilityModifier(stats.int,),
    wisMod: abilityModifier(stats.wis,),
    chaMod: abilityModifier(stats.cha,),
  };
}

/**
 * Get the modifier for a specific ability from a stat block.
 */
export function getModifier(stats: StatBlock, ability: AbilityName,): number {
  return abilityModifier(stats[ability],);
}
