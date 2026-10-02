// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Card deck management: creation, shuffling, drawing, discarding.
 */

import type { Card, Suit, Rank, DeckState } from "./types";

// ── Constants ─────────────────────────────────────────────────

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const RANK_VALUES: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
  "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
};

// ── RNG ───────────────────────────────────────────────────────

export function cryptoRandom(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

// ── Deck Management ───────────────────────────────────────────

/** Create a standard 52-card deck */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ suit, rank, value: RANK_VALUES[rank] });
    }
  }
  return cards;
}

/** Shuffle a deck using Fisher-Yates with crypto RNG */
export function shuffleDeck(cards: Card[]): Card[] {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = cryptoRandom(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Initialize deck state with a freshly shuffled 52-card deck */
export function initDeckState(): DeckState {
  const deck = shuffleDeck(createDeck());
  return {
    remaining: deck,
    discarded: [],
    total: deck.length,
  };
}

/** Draw cards from deck. Auto-reshuffles discard when empty. */
export function drawCards(deck: DeckState, count: number): Card[] {
  const drawn: Card[] = [];

  for (let i = 0; i < count; i++) {
    // Reshuffle discard into remaining if needed
    if (deck.remaining.length === 0) {
      if (deck.discarded.length === 0) break; // No cards left at all
      deck.remaining = shuffleDeck(deck.discarded);
      deck.discarded = [];
    }
    const card = deck.remaining.pop()!;
    drawn.push(card);
  }

  return drawn;
}

/** Return cards to discard pile */
export function discardCards(deck: DeckState, cards: Card[]): void {
  deck.discarded.push(...cards);
}
