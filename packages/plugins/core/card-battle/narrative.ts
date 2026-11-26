// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle round narrative generation.
 */

import type { Card, CombatCardAction, CardOutcome } from "./types";
import { cryptoRandom } from "./deck";
import { ACTION_MODIFIERS } from "./combat";

/** Opponent names for narrative */
const OPPONENT_NAMES = ["the bandit", "the rogue", "the rival", "the stranger"];

export function pickOpponentName(): string {
  return OPPONENT_NAMES[cryptoRandom(OPPONENT_NAMES.length)];
}

export function buildRoundNarrative(
  playerCard: Card,
  opponentCard: Card,
  action: CombatCardAction,
  outcome: CardOutcome,
  damage: number,
  opponentName: string,
): string {
  const mod = ACTION_MODIFIERS[action];
  const pCard = `${playerCard.rank}${playerCard.suit === "hearts" ? "♥" : playerCard.suit === "diamonds" ? "♦" : playerCard.suit === "clubs" ? "♣" : "♠"}`;
  const oCard = `${opponentCard.rank}${opponentCard.suit === "hearts" ? "♥" : opponentCard.suit === "diamonds" ? "♦" : opponentCard.suit === "clubs" ? "♣" : "♠"}`;

  const playerLine = `You ${mod.desc} ${pCard}`;
  const opponentLine = `${opponentName} plays ${oCard}`;

  switch (outcome) {
    case "critical_win":
      return `${playerLine}! Critical hit! ${opponentLine} stands no chance. ${damage} damage!`;
    case "win":
      return `${playerLine}. ${opponentLine}. You deal ${damage} damage!`;
    case "draw":
      return `${playerLine}. ${opponentLine}. Cards match — no damage dealt.`;
    case "lose":
      return `${playerLine}, but ${opponentLine} overpowers you. You take ${damage} damage!`;
    case "critical_lose":
      return `${playerLine}, but ${counterLine(opponentName)}! Critical hit against you. ${damage} damage!`;
  }
}

function counterLine(name: string): string {
  const lines = [
    `${name} counters devastatingly`,
    `${name} finds your weakness`,
    `${name} exploits your opening`,
  ];
  return lines[cryptoRandom(lines.length)];
}
