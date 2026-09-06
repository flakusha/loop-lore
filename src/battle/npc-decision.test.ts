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
});
