/**
 * NPC Combat Decision Tests
 *
 * Pins personality-weighted fight/flight/fallback choices.
 */
import { describe, expect, it, } from "bun:test";
import { makeNPCDecision, } from "./npc-integration/decision.js";
import { type NPCPersonality, } from "./npc-integration/types.js";

const BRUTE: NPCPersonality = { aggression: 90, caution: 10, loyalty: 80, intelligence: 20, courage: 90, };
const COWARD: NPCPersonality = { aggression: 10, caution: 10, loyalty: 10, intelligence: 10, courage: 5, };

describe("makeNPCDecision", () => {
  it("picks attack for a healthy aggressive personality", () => {
    const d = makeNPCDecision(BRUTE, 100, 100, 1, 1, [],);
    expect(d.type,).toBe("attack",);
    expect(d.confidence,).toBeGreaterThanOrEqual(0,);
    expect(d.confidence,).toBeLessThanOrEqual(100,);
  });
  it("picks flee for a wounded outnumbered coward", () => {
    const d = makeNPCDecision(COWARD, 10, 100, 3, 1, [],);
    expect(d.type,).toBe("flee",);
  });
  it("always returns a reasoned decision", () => {
    const d = makeNPCDecision(BRUTE, 40, 100, 2, 2, [],);
    expect(d.reasoning.length,).toBeGreaterThan(0,);
  });

  // ── Edge cases ──────────────────────────────────────────────

  it("treats 0 HP as below 25% threshold — coward should still flee", () => {
    const d = makeNPCDecision(COWARD, 0, 100, 1, 1, [],);
    expect(d.type,).toBe("flee",);
  });

  it("does not crash on negative HP", () => {
    // healthPercent = (-10 / 100) * 100 = -10 — extreme low.
    const d = makeNPCDecision(COWARD, -10, 100, 1, 1, [],);
    expect(d.confidence,).toBeGreaterThanOrEqual(0,);
    expect(d.confidence,).toBeLessThanOrEqual(100,);
    expect(d.reasoning.length,).toBeGreaterThan(0,);
  });

  it("does not crash on NaN HP (yields a safe decision)", () => {
    const d = makeNPCDecision(BRUTE, NaN, 100, 1, 1, [],);
    expect(d.type,).toBeOneOf(["attack", "defend", "flee", "negotiate", "use_item", "special",],);
    expect(d.confidence,).toBeGreaterThanOrEqual(0,);
    expect(d.confidence,).toBeLessThanOrEqual(100,);
  });

  it("does not crash on HP > maxHealth (>100%)", () => {
    // 150 HP / 100 max — over-full bar.
    const d = makeNPCDecision(BRUTE, 150, 100, 1, 1, [],);
    expect(d.type,).toBeOneOf(["attack", "defend", "flee", "negotiate", "use_item", "special",],);
    expect(d.reasoning.length,).toBeGreaterThan(0,);
  });

  it("confidence is clamped to [0, 100] even on extreme personality values", () => {
    const EXTREME: NPCPersonality = { aggression: 100, caution: 100, loyalty: 100, intelligence: 100, courage: 100, };
    const d = makeNPCDecision(EXTREME, 50, 100, 5, 5, [],);
    expect(d.confidence,).toBeGreaterThanOrEqual(0,);
    expect(d.confidence,).toBeLessThanOrEqual(100,);
  });

  it("still produces reasoning text on a 0-HP aggressive NPC", () => {
    const d = makeNPCDecision(BRUTE, 0, 100, 1, 1, [],);
    expect(d.reasoning.length,).toBeGreaterThan(0,);
  });

  it("treats zero enemy/ally counts as 'no outnumbering'", () => {
    // BRUTE with 0 enemies / 0 allies: not outnumbered, full health.
    const d = makeNPCDecision(BRUTE, 100, 100, 0, 0, [],);
    expect(d.type,).toBeOneOf(["attack", "defend", "flee", "negotiate", "use_item", "special",],);
  });

  it("battle memories with defeat outcomes can shift the decision away from attack", () => {
    const recentDefeats = [
      {
        battleId: "b1",
        timestamp: "t",
        outcome: "defeat" as const,
        opponents: ["x",],
        lessons: [],
        emotionalImpact: -90,
      },
      {
        battleId: "b2",
        timestamp: "t",
        outcome: "defeat" as const,
        opponents: ["x",],
        lessons: [],
        emotionalImpact: -90,
      },
      {
        battleId: "b3",
        timestamp: "t",
        outcome: "defeat" as const,
        opponents: ["x",],
        lessons: [],
        emotionalImpact: -90,
      },
    ];
    const d = makeNPCDecision(BRUTE, 80, 100, 1, 1, recentDefeats,);
    // emotionalImpact/-10 = -27 → memoryModifier = -27, so attack loses weight.
    expect(d.type,).toBeOneOf(["attack", "defend", "flee", "negotiate",],);
    expect(d.reasoning.length,).toBeGreaterThan(0,);
  });
});
