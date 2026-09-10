// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Card Battle Routes Tests — exercises every branch in routes.ts.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { handleStart, handlePlay, handleActions } from "./routes";
import { initBattle } from "./engine";
import type { CardBattleState } from "./types";

const START_URL = "http://x/api/card-battle/start";
const PLAY_URL = "http://x/api/card-battle/play";
const ACTIONS_URL = "http://x/api/card-battle/actions";

/** Helper: read JSON body from a Response. */
async function json(res: Response | null): Promise<Record<string, unknown>> {
  if (!res) throw new Error("expected Response, got null");
  return (await res.json()) as Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────
// handleStart
// ──────────────────────────────────────────────────────────────

describe("handleStart", () => {
  describe("path/method guards", () => {
    test("returns null for GET (wrong method)", async () => {
      const res = await handleStart(new Request(START_URL, { method: "GET" }));
      expect(res).toBeNull();
    });

    test("returns null for PUT (wrong method)", async () => {
      const res = await handleStart(new Request(START_URL, { method: "PUT" }));
      expect(res).toBeNull();
    });

    test("returns null for wrong path", async () => {
      const res = await handleStart(new Request("http://x/api/card-battle/other", {
        method: "POST",
        body: "{}",
      }));
      expect(res).toBeNull();
    });
  });

  describe("body parsing", () => {
    test("empty body uses defaults: playerHp=100, difficulty=medium, handSize=5", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
      }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);
      const body = await json(res);
      const state = body.state as CardBattleState;
      expect(state.playerHp).toBe(100);
      expect(state.playerMaxHp).toBe(100);
      expect(state.playerHand).toHaveLength(5);
    });

    test("malformed JSON body also falls back to defaults", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: "not-json",
      }));
      expect(res!.status).toBe(200);
      const body = await json(res);
      const state = body.state as CardBattleState;
      expect(state.playerHp).toBe(100);
      expect(state.playerHand).toHaveLength(5);
    });

    test("non-number playerHp falls back to default 100", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ playerHp: "150" }),
      }));
      expect(res!.status).toBe(200);
      const body = await json(res);
      const state = body.state as CardBattleState;
      expect(state.playerHp).toBe(100);
    });

    test("non-string difficulty falls back to default medium", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ difficulty: 42 }),
      }));
      expect(res!.status).toBe(200);
      const body = await json(res);
      const state = body.state as CardBattleState;
      expect(state.opponentHandSize).toBe(4); // medium = 4
    });

    test("non-number handSize falls back to default 5", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ handSize: "big" }),
      }));
      expect(res!.status).toBe(200);
      const body = await json(res);
      expect((body.state as CardBattleState).playerHand).toHaveLength(5);
    });
  });

  describe("custom valid body", () => {
    test("passes playerHp, difficulty, handSize through to engine", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ playerHp: 250, difficulty: "hard", handSize: 7 }),
      }));
      expect(res!.status).toBe(200);
      const body = await json(res);
      const state = body.state as CardBattleState;
      expect(state.playerHp).toBe(250);
      expect(state.playerMaxHp).toBe(250);
      expect(state.opponentHp).toBe(250);
      expect(state.opponentHandSize).toBe(5); // hard = 5
      expect(state.playerHand).toHaveLength(7);
    });
  });

  describe("invalid difficulty", () => {
    test("rejects difficulty not in whitelist", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ difficulty: "impossible" }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toBe('difficulty must be "easy", "medium", or "hard"');
    });
  });

  describe("invalid playerHp", () => {
    test("rejects playerHp below 10", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ playerHp: 5 }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toBe("playerHp must be 10-1000");
    });

    test("rejects playerHp above 1000", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ playerHp: 2000 }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toBe("playerHp must be 10-1000");
    });

    test("boundary playerHp=10 is accepted", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ playerHp: 10 }),
      }));
      expect(res!.status).toBe(200);
    });

    test("boundary playerHp=1000 is accepted", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ playerHp: 1000 }),
      }));
      expect(res!.status).toBe(200);
    });
  });

  describe("invalid handSize", () => {
    test("rejects handSize below 3", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ handSize: 2 }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toBe("handSize must be 3-7");
    });

    test("rejects handSize above 7", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ handSize: 8 }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toBe("handSize must be 3-7");
    });

    test("boundary handSize=3 is accepted", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ handSize: 3 }),
      }));
      expect(res!.status).toBe(200);
      const body = await json(res);
      expect((body.state as CardBattleState).playerHand).toHaveLength(3);
    });

    test("boundary handSize=7 is accepted", async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ handSize: 7 }),
      }));
      expect(res!.status).toBe(200);
      const body = await json(res);
      expect((body.state as CardBattleState).playerHand).toHaveLength(7);
    });
  });

  describe("response shape", () => {
    let body: Record<string, unknown>;
    let state: CardBattleState;
    let handDisplay: Array<{ index: number; card: string; value: number }>;
    let playerHand: unknown;

    beforeEach(async () => {
      const res = await handleStart(new Request(START_URL, {
        method: "POST",
        body: JSON.stringify({ playerHp: 100, difficulty: "medium", handSize: 5 }),
      }));
      expect(res!.status).toBe(200);
      body = await json(res);
      state = body.state as CardBattleState;
      handDisplay = body.handDisplay as Array<{ index: number; card: string; value: number }>;
      playerHand = body.playerHand;
    });

    test("ui-safe deck exposes only counts, not card array", () => {
      const deck = state.deck as unknown as Record<string, unknown>;
      expect(deck.remaining).toBeTypeOf("number");
      expect(deck.discarded).toBeTypeOf("number");
      expect(deck.remaining).toBe(47); // 52 - 5 dealt
      expect(deck.discarded).toBe(0);
    });

    test("handDisplay is arrays of {index, card, value} matching playerHand", () => {
      expect(handDisplay).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(handDisplay[i].index).toBe(i);
        expect(handDisplay[i].card).toBeTypeOf("string");
        expect(handDisplay[i].value).toBeTypeOf("number");
      }
    });

    test("playerHand echoes state.playerHand", () => {
      expect(playerHand).toEqual(state.playerHand);
    });
  });
});

// ──────────────────────────────────────────────────────────────
// handlePlay
// ──────────────────────────────────────────────────────────────

describe("handlePlay", () => {
  describe("path/method guards", () => {
    test("returns null for GET", async () => {
      const res = await handlePlay(new Request(PLAY_URL, { method: "GET" }));
      expect(res).toBeNull();
    });

    test("returns null for wrong path", async () => {
      const res = await handlePlay(new Request("http://x/api/card-battle/wrong", {
        method: "POST",
        body: "{}",
      }));
      expect(res).toBeNull();
    });
  });

  describe("body validation", () => {
    test("returns 400 for invalid JSON body", async () => {
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: "not-json",
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toBe("Invalid JSON body");
    });

    test("returns 400 when cardIndex is missing (undefined)", async () => {
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ action: "attack", state: {} }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toBe("cardIndex is required (number)");
    });

    test("returns 400 when cardIndex is a string", async () => {
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: "0", action: "attack", state: {} }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toBe("cardIndex is required (number)");
    });

    test("returns 400 when action is invalid", async () => {
      const state = initBattle();
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: 0, action: "dance", state }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toBe("action must be one of: attack, defend, feint, bluff, charm");
    });

    test("returns 400 when action is non-string", async () => {
      const state = initBattle();
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: 0, action: 42, state }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toBe("action must be one of: attack, defend, feint, bluff, charm");
    });

    test("returns 400 when state is missing", async () => {
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: 0, action: "attack" }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("state is required");
    });

    test("returns 400 when state is a non-object", async () => {
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: 0, action: "attack", state: "not-an-object" }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("state is required");
    });
  });

  describe("engine errors", () => {
    test("returns 400 with engine error message when cardIndex out of range", async () => {
      const state = initBattle();
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: 99, action: "attack", state }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("Invalid card index");
    });

    test("returns 400 with engine error message when battle is already finished", async () => {
      const state = initBattle();
      state.finished = true;
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: 0, action: "attack", state }),
      }));
      expect(res!.status).toBe(400);
      const body = await json(res);
      expect(body.error).toContain("already finished");
    });
  });

  describe("happy path", () => {
    test("returns round, state (with count-only deck), handDisplay, newCard, finished, winner", async () => {
      const state = initBattle(100, "easy", 5);
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: 0, action: "attack", state }),
      }));
      expect(res!.status).toBe(200);
      const body = await json(res);

      // round
      expect(body.round).toBeTruthy();
      const round = body.round as Record<string, unknown>;
      expect(round.action).toBe("attack");
      expect(typeof round.outcome).toBe("string");
      expect(typeof round.narrative).toBe("string");

      // state — deck should be count-only
      const returnedState = body.state as CardBattleState;
      const deck = returnedState.deck as unknown as Record<string, unknown>;
      expect(deck.remaining).toBeTypeOf("number");
      expect(deck.discarded).toBeTypeOf("number");

      // handDisplay
      expect(Array.isArray(body.handDisplay)).toBe(true);
      const handDisplay = body.handDisplay as Array<{ index: number; card: string; value: number }>;
      expect(handDisplay.length).toBe(returnedState.playerHand.length);

      // newCard present after a successful play (hand refilled)
      expect(body.newCard).toBeTruthy();
      const newCard = body.newCard as { card: string; value: number };
      expect(typeof newCard.card).toBe("string");
      expect(typeof newCard.value).toBe("number");

      // finished/winner
      expect("finished" in body).toBe(true);
      expect("winner" in body).toBe(true);
    });

    test("playBattleCard mutates state — rounds grow and hand stays same size", async () => {
      const state = initBattle(100, "easy", 5);
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: 2, action: "defend", state }),
      }));
      expect(res!.status).toBe(200);
      const body = await json(res);
      // Engine mutates the parsed body, not the test's original `state` ref.
      const returnedState = body.state as CardBattleState;
      expect(returnedState.rounds).toHaveLength(1);
      // Player plays a card and draws one → hand size unchanged
      expect(returnedState.playerHand.length).toBe(5);
    });

    test("playerHand echoes state.playerHand after play", async () => {
      const state = initBattle(100, "easy", 5);
      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: 0, action: "bluff", state }),
      }));
      const body = await json(res);
      expect(body.playerHand).toEqual((body.state as CardBattleState).playerHand);
    });

    test("newCard is undefined when post-play playerHand is empty (deck exhausted)", async () => {
      // Set up: playerHand has exactly 1 card, deck has 0 remaining+discarded.
      // playBattleCard splices the only card (hand -> []), the opponent-draw
      // block is skipped because deck total is 0, engine falls through to the
      // "No cards remain" branch and returns successfully WITHOUT refilling
      // the hand. So when routes.ts reads battleState.playerHand.length, it
      // sees 0 and the `newCard = undefined` branch fires.
      const state = initBattle(100, "easy", 3);
      // Keep only one card in hand.
      state.playerHand = state.playerHand.slice(0, 1);
      // Empty the deck completely (both remaining and discarded).
      state.deck.remaining.length = 0;
      state.deck.discarded.length = 0;

      const res = await handlePlay(new Request(PLAY_URL, {
        method: "POST",
        body: JSON.stringify({ cardIndex: 0, action: "attack", state }),
      }));
      expect(res!.status).toBe(200);
      const body = await json(res);
      expect(body.newCard).toBeUndefined();
      expect((body.state as CardBattleState).finished).toBe(true);
      expect((body.state as CardBattleState).playerHand).toHaveLength(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────
// handleActions
// ──────────────────────────────────────────────────────────────

describe("handleActions", () => {
  describe("path/method guards", () => {
    test("returns null for POST (wrong method)", async () => {
      const res = await handleActions(new Request(ACTIONS_URL, { method: "POST" }));
      expect(res).toBeNull();
    });

    test("returns null for wrong path", async () => {
      const res = await handleActions(new Request("http://x/api/card-battle/action", {
        method: "GET",
      }));
      expect(res).toBeNull();
    });
  });

  describe("happy path", () => {
    test("returns static actions array, cardValues, and suitBreak", async () => {
      const res = await handleActions(new Request(ACTIONS_URL, { method: "GET" }));
      expect(res!.status).toBe(200);
      const body = await json(res);

      const actions = body.actions as Array<{ id: string; name: string; description: string }>;
      expect(actions).toHaveLength(5);
      const ids = actions.map(a => a.id);
      expect(ids).toEqual(["attack", "defend", "feint", "bluff", "charm"]);
      // Each action has id, name, description
      for (const a of actions) {
        expect(a.name).toBeTruthy();
        expect(a.description).toBeTruthy();
      }

      expect(body.cardValues).toBe("2=2, 3=3, ..., 10=10, J=11, Q=12, K=13, A=14");
      expect(body.suitBreak).toBe("Tie-break: spades > hearts > diamonds > clubs");
    });
  });
});
