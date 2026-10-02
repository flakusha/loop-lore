// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Card comparison and damage calculation.
 */

import type { Card, Suit, CombatCardAction, CardOutcome } from "./types";

/** Action modifiers affect effective card value */
export const ACTION_MODIFIERS: Record<CombatCardAction, {
  /** Flat value added to player card */
  valueMod: number;
  /** Multiplier for effect value on hit */
  effectMod: number;
  /** Description for narrative */
  desc: string;
}> = {
  attack:  { valueMod: 0,  effectMod: 1.5, desc: "slashes with" },
  defend:  { valueMod: 3,  effectMod: 0.5, desc: "blocks with" },
  feint:   { valueMod: -2, effectMod: 2.0, desc: "feints with" },
  bluff:   { valueMod: 0,  effectMod: 1.0, desc: "bluffs with" },
  charm:   { valueMod: 1,  effectMod: 0.8, desc: "charms with" },
};

// ── Card Comparison ───────────────────────────────────────────

/**
 * Compare two cards. Returns base outcome before action modifiers.
 * Higher card value wins; ties go to suit order (spades > hearts > diamonds > clubs).
 */
const SUIT_ORDER: Record<Suit, number> = {
  spades: 4, hearts: 3, diamonds: 2, clubs: 1,
};

export function compareCards(playerCard: Card, opponentCard: Card): CardOutcome {
  if (playerCard.value > opponentCard.value) return "win";
  if (playerCard.value < opponentCard.value) return "lose";

  // Tie-break by suit
  const playerSuit = SUIT_ORDER[playerCard.suit];
  const opponentSuit = SUIT_ORDER[opponentCard.suit];
  if (playerSuit > opponentSuit) return "win";
  if (playerSuit < opponentSuit) return "lose";

  // True draw — both same value and suit edge case shouldn't happen
  return "draw";
}

// ── Damage Calculation ────────────────────────────────────────

/**
 * Calculate damage for a round. Uses card value as base, modified by action.
 *
 * @param cardValue  The winning card's numeric value
 * @param action     The combat action used
 * @param outcome    The round outcome
 * @param critical   Whether this is a critical hit
 */
export function calculateDamage(
  cardValue: number,
  action: CombatCardAction,
  outcome: CardOutcome,
  critical: boolean,
): number {
  const mod = ACTION_MODIFIERS[action];
  let base = cardValue * mod.effectMod;

  if (critical) base *= 2;
  if (outcome === "win") return Math.max(1, Math.round(base));
  if (outcome === "critical_win") return Math.max(1, Math.round(base * 1.5));
  return 0;
}
