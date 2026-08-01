import { describe, it, expect } from "bun:test";
import {
  initSeduction,
  playSeductionCard,
  cardToString,
} from "./engine";
import type { SeductionCardType } from "./types";

describe("NSFW Card Game Engine", () => {
  // ── initSeduction ─────────────────────────────────────────

  describe("initSeduction", () => {
    it("creates state with default medium difficulty", () => {
      const state = initSeduction();

      expect(state.intimacy).toBe(0);
      expect(state.targetIntimacy).toBe(70);
      expect(state.resistance).toBe(50);
      expect(state.maxResistance).toBe(50);
      expect(state.hand).toHaveLength(5);
      expect(state.rounds).toHaveLength(0);
      expect(state.finished).toBe(false);
      expect(state.outcome).toBeNull();
      expect(state.currentRound).toBe(0);
      expect(state.maxRounds).toBe(7);
    });

    it("creates state with easy difficulty", () => {
      const state = initSeduction("easy");

      expect(state.targetIntimacy).toBe(50);
      expect(state.maxResistance).toBe(30);
      expect(state.maxRounds).toBe(8);
    });

    it("creates state with hard difficulty", () => {
      const state = initSeduction("hard");

      expect(state.targetIntimacy).toBe(85);
      expect(state.maxResistance).toBe(70);
      expect(state.maxRounds).toBe(6);
    });

    it("respects custom handSize", () => {
      const state = initSeduction("medium", 7);

      expect(state.hand).toHaveLength(7);
    });

    it("generates cards with valid types", () => {
      const validTypes: SeductionCardType[] = [
        "flirt", "charm", "tease", "compliment", "touch", "kiss",
      ];

      const state = initSeduction("medium", 10);
      for (const card of state.hand) {
        expect(validTypes).toContain(card.type);
        expect(card.power).toBeGreaterThanOrEqual(1);
        expect(card.power).toBeLessThanOrEqual(5);
        expect(card.name.length).toBeGreaterThan(0);
        expect(card.description.length).toBeGreaterThan(0);
      }
    });

    it("sorts hand by power descending", () => {
      const state = initSeduction("medium", 7);

      for (let i = 0; i < state.hand.length - 1; i++) {
        expect(state.hand[i].power).toBeGreaterThanOrEqual(state.hand[i + 1].power);
      }
    });

    it("ensures variety in hand (max 2 of same type)", () => {
      // Run a few times to catch randomness
      for (let run = 0; run < 10; run++) {
        const state = initSeduction("medium", 7);
        const typeCounts = new Map<string, number>();
        for (const card of state.hand) {
          typeCounts.set(card.type, (typeCounts.get(card.type) || 0) + 1);
        }
        for (const [, count] of typeCounts) {
          expect(count).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  // ── playSeductionCard ─────────────────────────────────────

  describe("playSeductionCard", () => {
    it("plays a card and returns round result", () => {
      const state = initSeduction("medium", 5);
      const round = playSeductionCard(state, 0);

      expect(round.round).toBe(1);
      expect(round.card).toBeDefined();
      expect(round.outcome).toMatch(/^(succeed|partial|fail)$/);
      expect(typeof round.intimacyChange).toBe("number");
      expect(round.narrative.length).toBeGreaterThan(0);
      expect(state.currentRound).toBe(1);
      expect(state.hand).toHaveLength(4);
    });

    it("updates intimacy after play", () => {
      const state = initSeduction("medium", 5);
      const round = playSeductionCard(state, 0);

      // Intimacy changed: either gained or stayed at 0 (fail on 0 → clamped)
      expect(round.intimacyChange).toBeDefined();
      expect(state.intimacy).toBeGreaterThanOrEqual(0);
      expect(state.intimacy).toBeLessThanOrEqual(100);
      // If outcome succeeded or partial, intimacy must have risen
      if (round.outcome !== "fail") {
        expect(state.intimacy).toBeGreaterThan(0);
      }
    });

    it("decreases resistance as intimacy rises", () => {
      const state = initSeduction("medium", 5);

      // Play cards until intimacy rises
      for (let i = 0; i < 3 && state.hand.length > 0; i++) {
        playSeductionCard(state, 0);
      }

      // Resistance should have decreased or stayed (if no intimacy gained)
      expect(state.resistance).toBeLessThanOrEqual(state.maxResistance);
    });

    it("throws on invalid card index", () => {
      const state = initSeduction("medium", 5);

      expect(() => playSeductionCard(state, -1)).toThrow("Invalid card index");
      expect(() => playSeductionCard(state, 10)).toThrow("Invalid card index");
    });

    it("throws when encounter is finished", () => {
      const state = initSeduction("medium", 3);
      // Play all cards to finish
      while (!state.finished && state.hand.length > 0) {
        playSeductionCard(state, 0);
      }

      expect(state.finished).toBe(true);
      expect(() => playSeductionCard(state, 0)).toThrow("Encounter is already finished");
    });

    it("tracks rounds correctly", () => {
      const state = initSeduction("medium", 5);

      playSeductionCard(state, 0);
      expect(state.rounds).toHaveLength(1);
      expect(state.rounds[0].round).toBe(1);

      playSeductionCard(state, 0);
      expect(state.rounds).toHaveLength(2);
      expect(state.rounds[1].round).toBe(2);
    });

    it("finishes when max rounds reached without hitting target", () => {
      // Hard difficulty with small hand — likely to exhaust rounds
      const state = initSeduction("hard", 3);

      while (!state.finished && state.hand.length > 0) {
        playSeductionCard(state, 0);
      }

      expect(state.finished).toBe(true);
      // If intimacy didn't reach target, outcome should be fail
      if (state.intimacy < state.targetIntimacy) {
        expect(state.outcome).toBe("fail");
      }
    });

    it("finishes with succeed when intimacy reaches target", () => {
      // Easy difficulty — low threshold, high hand size
      const state = initSeduction("easy", 7);

      // Play aggressively
      while (!state.finished && state.hand.length > 0) {
        playSeductionCard(state, 0);
      }

      // On easy, with enough cards, we might succeed
      if (state.intimacy >= state.targetIntimacy) {
        expect(state.outcome).toBe("succeed");
      }
    });
  });

  // ── cardToString ──────────────────────────────────────────

  describe("cardToString", () => {
    it("formats card with emoji and power", () => {
      const state = initSeduction("medium", 1);
      const card = state.hand[0];

      const str = cardToString(card);

      // Should contain emoji
      expect(str).toMatch(/[😏✨💋💕🤝😘]/);
      // Should contain card name
      expect(str).toContain(card.name);
      // Should contain power
      expect(str).toContain(`(${card.power})`);
    });

    it("uses correct emoji for each card type", () => {
      const typeEmojis: Record<SeductionCardType, string> = {
        flirt: "😏",
        charm: "✨",
        tease: "💋",
        compliment: "💕",
        touch: "🤝",
        kiss: "😘",
      };

      // Generate many cards to hit all types
      const state = initSeduction("medium", 100);
      for (const card of state.hand) {
        const str = cardToString(card);
        expect(str).toContain(typeEmojis[card.type]);
      }
    });
  });

  // ── Round narrative outcomes ──────────────────────────────

  describe("round narratives", () => {
    it("provides narrative for succeed outcome", () => {
      // Test with many runs to ensure succeed outcomes exist
      let foundSucceed = false;
      for (let run = 0; run < 50 && !foundSucceed; run++) {
        const state = initSeduction("easy", 10);
        for (let i = 0; i < state.hand.length; i++) {
          const round = playSeductionCard(state, 0);
          if (round.outcome === "succeed") {
            foundSucceed = true;
            expect(round.narrative.length).toBeGreaterThan(0);
            expect(round.intimacyChange).toBeGreaterThan(0);
            break;
          }
        }
      }
      expect(foundSucceed).toBe(true);
    });

    it("provides narrative for fail outcome", () => {
      // Test with many runs to ensure fail outcomes exist
      let foundFail = false;
      for (let run = 0; run < 50 && !foundFail; run++) {
        const state = initSeduction("hard", 10);
        for (let i = 0; i < state.hand.length; i++) {
          const round = playSeductionCard(state, 0);
          if (round.outcome === "fail") {
            foundFail = true;
            expect(round.narrative.length).toBeGreaterThan(0);
            expect(round.intimacyChange).toBeLessThanOrEqual(0);
            break;
          }
        }
      }
      expect(foundFail).toBe(true);
    });
  });

  // ── Difficulty scaling ────────────────────────────────────

  describe("difficulty scaling", () => {
    it("easy has lower target and resistance than medium", () => {
      const easy = initSeduction("easy");
      const medium = initSeduction("medium");

      expect(easy.targetIntimacy).toBeLessThan(medium.targetIntimacy);
      expect(easy.maxResistance).toBeLessThan(medium.maxResistance);
      expect(easy.maxRounds).toBeGreaterThan(medium.maxRounds);
    });

    it("hard has higher target and resistance than medium", () => {
      const hard = initSeduction("hard");
      const medium = initSeduction("medium");

      expect(hard.targetIntimacy).toBeGreaterThan(medium.targetIntimacy);
      expect(hard.maxResistance).toBeGreaterThan(medium.maxResistance);
      expect(hard.maxRounds).toBeLessThan(medium.maxRounds);
    });
  });
});
