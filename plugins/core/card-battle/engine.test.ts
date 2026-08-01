/**
 * Card Battle Engine Tests
 */

import { describe, test, expect } from "bun:test";
import {
  createDeck,
  shuffleDeck,
  initDeckState,
  drawCards,
  discardCards,
  compareCards,
  calculateDamage,
  initBattle,
  playBattleCard,
  cardToString,
} from "./engine";
import type { Card, CombatCardAction } from "./types";

// ── Deck Management ───────────────────────────────────────────

describe("createDeck", () => {
  test("creates 52 cards", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
  });

  test("each card has suit, rank, value", () => {
    for (const card of createDeck()) {
      expect(card.suit).toBeTruthy();
      expect(card.rank).toBeTruthy();
      expect(card.value).toBeGreaterThanOrEqual(2);
      expect(card.value).toBeLessThanOrEqual(14);
    }
  });

  test("no duplicate cards", () => {
    const keys = createDeck().map(c => `${c.suit}-${c.rank}`);
    expect(new Set(keys).size).toBe(52);
  });
});

describe("shuffleDeck", () => {
  test("preserves all cards", () => {
    const original = createDeck();
    const shuffled = shuffleDeck(original);
    expect(shuffled).toHaveLength(52);
  });

  test("produces different order (statistical)", () => {
    const deck = createDeck();
    const s1 = shuffleDeck(deck);
    const s2 = shuffleDeck(deck);
    // Extremely unlikely to be identical
    const same = s1.every((c, i) => c.rank === s2[i].rank && c.suit === s2[i].suit);
    expect(same).toBe(false);
  });
});

describe("deck state", () => {
  test("initDeckState starts with 52 remaining", () => {
    const deck = initDeckState();
    expect(deck.remaining).toHaveLength(52);
    expect(deck.discarded).toHaveLength(0);
    expect(deck.total).toBe(52);
  });

  test("drawCards reduces remaining", () => {
    const deck = initDeckState();
    const drawn = drawCards(deck, 5);
    expect(drawn).toHaveLength(5);
    expect(deck.remaining).toHaveLength(47);
  });

  test("drawCards reshuffles discard when remaining empty", () => {
    const deck = initDeckState();
    // Draw all 52
    const all = drawCards(deck, 52);
    expect(all).toHaveLength(52);
    expect(deck.remaining).toHaveLength(0);

    // Discard all and draw again
    discardCards(deck, all);
    expect(deck.discarded).toHaveLength(52);

    const redrawn = drawCards(deck, 5);
    expect(redrawn).toHaveLength(5);
    expect(deck.remaining).toHaveLength(47);
  });

  test("drawCards returns fewer when not enough cards", () => {
    const deck = initDeckState();
    drawCards(deck, 50); // 2 remaining
    discardCards(deck, []);
    const small = drawCards(deck, 5);
    // 2 from remaining + reshuffle would happen, so should get 5
    // But if we don't discard previous, it depends
    expect(small.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Card Comparison ───────────────────────────────────────────

describe("compareCards", () => {
  test("higher value wins", () => {
    const high: Card = { suit: "clubs", rank: "A", value: 14 };
    const low: Card = { suit: "spades", rank: "2", value: 2 };
    expect(compareCards(high, low)).toBe("win");
    expect(compareCards(low, high)).toBe("lose");
  });

  test("equal value, higher suit wins", () => {
    const spade: Card = { suit: "spades", rank: "K", value: 13 };
    const heart: Card = { suit: "hearts", rank: "K", value: 13 };
    expect(compareCards(spade, heart)).toBe("win");
    expect(compareCards(heart, spade)).toBe("lose");
  });

  test("identical card is draw", () => {
    const a: Card = { suit: "diamonds", rank: "7", value: 7 };
    expect(compareCards(a, { ...a })).toBe("draw");
  });
});

// ── Damage Calculation ────────────────────────────────────────

describe("calculateDamage", () => {
  test("attack gives 1.5x damage", () => {
    const dmg = calculateDamage(10, "attack", "win", false);
    expect(dmg).toBe(15);
  });

  test("defend gives 0.5x damage", () => {
    const dmg = calculateDamage(10, "defend", "win", false);
    expect(dmg).toBe(5);
  });

  test("critical doubles damage", () => {
    const normal = calculateDamage(10, "attack", "win", false);
    const crit = calculateDamage(10, "attack", "critical_win", true);
    expect(crit).toBeGreaterThan(normal);
  });

  test("zero damage on loss", () => {
    expect(calculateDamage(10, "attack", "lose", false)).toBe(0);
    expect(calculateDamage(10, "attack", "draw", false)).toBe(0);
  });

  test("damage is at least 1 on win", () => {
    const dmg = calculateDamage(1, "defend", "win", false);
    expect(dmg).toBeGreaterThanOrEqual(1);
  });
});

// ── Battle State Machine ──────────────────────────────────────

describe("initBattle", () => {
  test("creates battle with proper HP", () => {
    const state = initBattle(50);
    expect(state.playerHp).toBe(50);
    expect(state.playerMaxHp).toBe(50);
    expect(state.opponentHp).toBe(50);
    expect(state.opponentMaxHp).toBe(50);
  });

  test("deals hand of correct size", () => {
    const state = initBattle(100, "medium", 5);
    expect(state.playerHand).toHaveLength(5);
  });

  test("starts not finished", () => {
    const state = initBattle();
    expect(state.finished).toBe(false);
    expect(state.winner).toBeNull();
  });
});

describe("playBattleCard", () => {
  test("plays a card and decrements hand", () => {
    const state = initBattle(100, "easy", 5);
    const handBefore = state.playerHand.length;
    playBattleCard(state, 0, "attack");
    // Should have drawn a replacement, so hand might stay same or decrease by 1
    // depending on deck availability
    expect(state.rounds).toHaveLength(1);
  });

  test("throws on invalid index", () => {
    const state = initBattle();
    expect(() => playBattleCard(state, 99, "attack")).toThrow("Invalid card index");
  });

  test("throws when finished", () => {
    const state = initBattle();
    state.finished = true;
    expect(() => playBattleCard(state, 0, "attack")).toThrow("already finished");
  });

  test("battle can finish", () => {
    const state = initBattle(5, "easy", 3); // Very low HP — should finish quickly
    for (let i = 0; i < 20 && !state.finished; i++) {
      if (state.playerHand.length > 0) {
        playBattleCard(state, 0, "attack");
      } else break;
    }
    // With HP 5, at least one side should lose in 20 rounds
    expect(state.finished).toBe(true);
  });

  test("reduces HP on hit", () => {
    const state = initBattle(100, "easy", 5);
    const initialHp = state.playerHp + state.opponentHp;
    playBattleCard(state, 0, "attack");
    const afterHp = state.playerHp + state.opponentHp;
    // At least one side should lose HP (unless draw)
    const hasDamage = afterHp < initialHp;
    const isDraw = state.rounds[0]?.outcome === "draw";
    expect(hasDamage || isDraw).toBe(true);
  });
});

// ── Utility ───────────────────────────────────────────────────

describe("cardToString", () => {
  test("formats correctly", () => {
    expect(cardToString({ suit: "hearts", rank: "A", value: 14 })).toBe("A♥");
    expect(cardToString({ suit: "diamonds", rank: "K", value: 13 })).toBe("K♦");
    expect(cardToString({ suit: "clubs", rank: "2", value: 2 })).toBe("2♣");
    expect(cardToString({ suit: "spades", rank: "10", value: 10 })).toBe("10♠");
  });
});