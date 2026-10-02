// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle state machine: initialization and round resolution.
 */

import type {
  Card,
  CardBattleState,
  CardBattleRound,
  CombatCardAction,
  CardOutcome,
} from "./types";
import { initDeckState, drawCards, discardCards } from "./deck";
import { ACTION_MODIFIERS, calculateDamage } from "./combat";
import { pickOpponentName, buildRoundNarrative } from "./narrative";

// ── Battle State Machine ──────────────────────────────────────

/** Difficulty → opponent hand size and card value boost */
const DIFFICULTY_CONFIG = {
  easy:   { handSize: 3, valueBoost: 0 },
  medium: { handSize: 4, valueBoost: 1 },
  hard:   { handSize: 5, valueBoost: 2 },
} as const;

/** Initialize a new card battle */
export function initBattle(
  playerHp = 100,
  difficulty: "easy" | "medium" | "hard" = "medium",
  handSize = 5,
): CardBattleState {
  const deck = initDeckState();
  const config = DIFFICULTY_CONFIG[difficulty];

  return {
    playerHp,
    playerMaxHp: playerHp,
    opponentHp: playerHp,
    opponentMaxHp: playerHp,
    playerHand: drawCards(deck, handSize),
    opponentHandSize: config.handSize,
    deck,
    rounds: [],
    finished: false,
    winner: null,
    currentRound: 0,
  };
}

/**
 * Play a card from the player's hand against the opponent.
 * Opponent plays the highest card in their hand (simple AI).
 * @throws When battle finished or card index invalid
 */
export function playBattleCard(
  state: CardBattleState,
  cardIndex: number,
  action: CombatCardAction,
): CardBattleRound {
  if (state.finished) throw new Error("Battle is already finished");
  if (cardIndex < 0 || cardIndex >= state.playerHand.length) {
    throw new Error(`Invalid card index ${cardIndex}. Hand has ${state.playerHand.length} cards.`);
  }

  // Player plays chosen card
  const playerCard = state.playerHand.splice(cardIndex, 1)[0];

  // Opponent draws and plays the highest card
  if (state.deck.remaining.length + state.deck.discarded.length > 0) {
    const opponentDraw = drawCards(state.deck, 1);
    if (opponentDraw.length > 0) {
      const opponentCard = opponentDraw[0];

      // Apply action modifier to effective comparison
      const actionMod = ACTION_MODIFIERS[action];
      const effectiveValue = playerCard.value + actionMod.valueMod;

      // Determine outcome
      let outcome: CardOutcome;
      if (effectiveValue > opponentCard.value) {
        // Critical win: natural high card + offensive action
        outcome = playerCard.value >= 12 && (action === "attack" || action === "feint")
          ? "critical_win"
          : "win";
      } else if (effectiveValue < opponentCard.value) {
        outcome = opponentCard.value >= 12 && action !== "defend"
          ? "critical_lose"
          : "lose";
      } else {
        outcome = "draw";
      }

      // Calculate damage
      const isCritical = outcome === "critical_win" || outcome === "critical_lose";
      const winnerValue = outcome.includes("win") ? playerCard.value : opponentCard.value;
      const damage = calculateDamage(winnerValue, action, outcome, isCritical);

      // Apply damage
      if (outcome === "win" || outcome === "critical_win") {
        state.opponentHp = Math.max(0, state.opponentHp - damage);
      } else if (outcome === "lose" || outcome === "critical_lose") {
        state.playerHp = Math.max(0, state.playerHp - damage);
      }

      // Discard both cards
      discardCards(state.deck, [playerCard, opponentCard]);

      // Draw a replacement card for the player
      const [newCard] = drawCards(state.deck, 1);
      if (newCard) state.playerHand.push(newCard);

      // Build round
      state.currentRound++;
      const opponentName = pickOpponentName();
      const round: CardBattleRound = {
        round: state.currentRound,
        playerCard,
        opponentCard,
        action,
        outcome,
        effectValue: damage,
        narrative: buildRoundNarrative(playerCard, opponentCard, action, outcome, damage, opponentName),
      };
      state.rounds.push(round);

      // Check win conditions
      if (state.playerHp <= 0 && state.opponentHp <= 0) {
        state.finished = true;
        state.winner = "draw";
      } else if (state.opponentHp <= 0) {
        state.finished = true;
        state.winner = "player";
      } else if (state.playerHp <= 0) {
        state.finished = true;
        state.winner = "opponent";
      } else if (state.playerHand.length === 0) {
        // Out of cards — compare HP
        state.finished = true;
        state.winner = state.playerHp > state.opponentHp
          ? "player"
          : state.playerHp < state.opponentHp
            ? "opponent"
            : "draw";
      }

      return round;
    }
  }

  // No cards left to draw — shouldn't happen with standard deck
  state.finished = true;
  state.winner = state.playerHp > state.opponentHp ? "player" : "draw";
  discardCards(state.deck, [playerCard]);
  state.currentRound++;
  return {
    round: state.currentRound,
    playerCard,
    opponentCard: { suit: "clubs", rank: "2", value: 2 },
    action,
    outcome: "draw",
    effectValue: 0,
    narrative: "No cards remain. The battle ends in a stalemate.",
  };
}

/** Card display helper */
export function cardToString(card: Card): string {
  const suitSymbol = card.suit === "hearts" ? "♥"
    : card.suit === "diamonds" ? "♦"
    : card.suit === "clubs" ? "♣"
    : "♠";
  return `${card.rank}${suitSymbol}`;
}
