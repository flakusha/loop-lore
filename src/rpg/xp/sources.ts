// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { safeJsonStringify, } from "../../utils.js";
import { xpForLevel, } from "./calculation.js";

// ── XP Sources ───────────────────────────────────────────

/** Minimum quest payout — a capped character still earns this per quest. */
export const QUEST_XP_MINIMUM = 100;

/**
 * Collision-proof ledger reference for an id pair, e.g. (world, location).
 * A plain `a:b` join is ambiguous when ids contain `:` — the JSON encoding
 * is injective, so distinct pairs always map to distinct dedupe keys.
 * @param first
 * @param second
 * @returns {string} Serialized `[first, second]`.
 */
export function encodeReferencePair(first: string, second: string | number,): string {
  const encoded = safeJsonStringify([first, second,],);
  return encoded.ok ? encoded.value : `${first}\u0000${second}`;
}

/** XP reward for defeating an enemy of a given CR (Challenge Rating) */
export const XP_BY_CR: Record<number, number> = {
  0: 10,
  0.125: 25,
  0.25: 50,
  0.5: 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
  11: 7200,
  12: 8400,
  13: 10_000,
  14: 11_500,
  15: 13_000,
  16: 15_000,
  17: 18_000,
  18: 20_000,
  19: 22_000,
  20: 25_000,
};

/**
 * Calculate XP reward for defeating an enemy.
 * @param cr - Challenge Rating of the enemy
 * @param partySize - Number of party members (splits XP)
 * @param wasAssist - Whether this character assisted (gets half XP)
 * @returns XP award per character
 */
export function xpForEnemyDefeat(
  cr: number,
  partySize = 1,
  wasAssist = false,
): number {
  const baseXp = XP_BY_CR[cr] ?? 100;
  const splitXp = Math.floor(baseXp / partySize,);
  return wasAssist ? Math.floor(splitXp / 2,) : splitXp;
}

/**
 * XP reward for completing a quest.
 *
 * The award derives from the level thresholds around `questLevel`; at
 * MAX_LEVEL both thresholds clamp to the same value, which would floor the
 * payout to 0. A capped character instead earns `QUEST_XP_MINIMUM` (100,
 * mirroring the flat CR fallback proxy) so completing content never pays
 * nothing — and, upstream, never burns a dedupe key on a zero row.
 * @param questLevel
 * @param difficulty
 * @returns {number}
 */
export function xpForQuest(
  questLevel: number,
  difficulty: "easy" | "medium" | "hard" | "deadly" = "medium",
): number {
  const multipliers: Record<string, number> = {
    easy: 0.5,
    medium: 1,
    hard: 1.5,
    deadly: 2,
  };

  const baseXp = xpForLevel(questLevel + 1,) - xpForLevel(questLevel,);
  const raw = Math.floor(baseXp * (multipliers[difficulty] ?? 1),);
  return Math.max(raw, QUEST_XP_MINIMUM,);
}

/**
 * XP reward for skill challenge or roleplay encounter.
 * @param characterLevel
 * @param difficulty
 * @returns {number}
 */
export function xpForSkillChallenge(
  characterLevel: number,
  difficulty: "easy" | "medium" | "hard" = "medium",
): number {
  const multipliers: Record<string, number> = {
    easy: 0.25,
    medium: 0.5,
    hard: 1,
  };

  const baseXp = 100 * characterLevel;
  return Math.floor(baseXp * (multipliers[difficulty] ?? 0.5),);
}

/** Flat award for a first-time location discovery. */
export const DISCOVERY_XP = 50;

/**
 * XP for charting a location for the first time.
 * Flat by design: discovery ticks are the deterministic tier, so the award
 * must not draw RNG or scale with state a replay could not reproduce.
 * @returns {number}
 */
export function xpForDiscovery(): number {
  return DISCOVERY_XP;
}

/** Flat award for one completed travel hop (a migration arrival). */
export const TRAVEL_LEG_XP = 25;

/**
 * XP for finishing one world-travel leg.
 * Flat for the same determinism reason as {@link xpForDiscovery}; long
 * routes simply accrue one award per completed hop.
 * @returns {number}
 */
export function xpForTravelLeg(): number {
  return TRAVEL_LEG_XP;
}
