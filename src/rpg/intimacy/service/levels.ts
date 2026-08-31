// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { INTIMACY_THRESHOLDS, } from "./types";
import type { IntimacyThreshold, } from "./types";

/**
 * Get the intimacy level label for a numeric score.
 * @param score
 */
export function getLevelLabel(score: number,): string {
  if (score >= INTIMACY_THRESHOLDS.soulbonded) { return "Soulbonded"; }
  if (score >= INTIMACY_THRESHOLDS.intimate) { return "Intimate"; }
  if (score >= INTIMACY_THRESHOLDS.dating) { return "Dating"; }
  if (score >= INTIMACY_THRESHOLDS.romanticInterest) { return "Romantic Interest"; }
  if (score >= INTIMACY_THRESHOLDS.closeFriends) { return "Close Friends"; }
  if (score >= INTIMACY_THRESHOLDS.friends) { return "Friends"; }
  if (score >= INTIMACY_THRESHOLDS.acquaintances) { return "Acquaintances"; }
  return "Strangers";
}

/**
 * Check which threshold events fire when moving from oldScore to newScore.
 * @param oldScore
 * @param newScore
 * @param alreadyUnlocked
 */
export function checkThresholds(
  oldScore: number,
  newScore: number,
  alreadyUnlocked: number[],
): IntimacyThreshold[] {
  const reached: IntimacyThreshold[] = [];

  for (const [label, level,] of Object.entries(INTIMACY_THRESHOLDS,)) {
    if (alreadyUnlocked.includes(level,)) { continue; }
    if (oldScore < level && newScore >= level) {
      reached.push({
        level,
        label,
        unlock: `New interactions unlocked at ${label} level`,
        npcReaction: `${label} threshold reached`,
        gameplayEffects: [`Intimacy level: ${label}`,],
      },);
    }
  }

  return reached;
}

/**
 * Suggest relationship type upgrade based on intimacy score.
 * @param score
 */
export function suggestRelationshipUpgrade(score: number,): string | undefined {
  if (score >= INTIMACY_THRESHOLDS.intimate) { return "romantic"; }
  if (score >= INTIMACY_THRESHOLDS.dating) { return "romantic_interest"; }
  if (score >= INTIMACY_THRESHOLDS.closeFriends) { return "friend"; }
  return undefined;
}
