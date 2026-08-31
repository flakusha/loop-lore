// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  NPCBattleMemory,
  NPCPersonality,
} from "./types";

/**
 * Get NPC morale modifier from personality
 * @param personality
 */
export function getPersonalityMoraleModifier(
  personality: NPCPersonality,
): number {
  let modifier = 0;

  // High courage = higher base morale
  modifier += (personality.courage - 50) / 5;

  // High loyalty = morale boost when fighting with allies
  modifier += (personality.loyalty - 50) / 10;

  // High caution = lower morale when outnumbered
  modifier -= (personality.caution - 50) / 10;

  return Math.max(-20, Math.min(20, Math.round(modifier,),),);
}

/**
 * Check if NPC would surrender
 * @param personality
 * @param currentHealth
 * @param maxHealth
 * @param battleMemories
 */
export function wouldNPCSurrender(
  personality: NPCPersonality,
  currentHealth: number,
  maxHealth: number,
  battleMemories: NPCBattleMemory[],
): { surrender: boolean; confidence: number } {
  const healthPercent = (currentHealth / maxHealth) * 100;

  // High courage NPCs rarely surrender
  if (personality.courage > 80) {
    return { surrender: false, confidence: 90, };
  }

  // Low health increases surrender chance
  let surrenderChance = 0;
  if (healthPercent < 20) { surrenderChance += 40; }
  else if (healthPercent < 40) { surrenderChance += 20; }
  else if (healthPercent < 60) { surrenderChance += 10; }

  // Low courage increases surrender chance
  surrenderChance += (50 - personality.courage) / 2;

  // Recent defeats increase surrender chance
  let defeatCount = 0;
  for (const m of battleMemories) { if (m.outcome === "defeat") { defeatCount++; } }
  surrenderChance += defeatCount * 5;

  // Cap at 95%
  surrenderChance = Math.min(95, Math.max(0, surrenderChance,),);

  return {
    surrender: Math.random() * 100 < surrenderChance,
    confidence: Math.round(surrenderChance,),
  };
}
