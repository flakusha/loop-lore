/**
 * Unit tests for src/schemas/reputation.ts — Unified Reputation Schema.
 *
 * Covers tier boundaries, clamping, and factory defaults for the canonical
 * ReputationScore shared across Social, Faction, NSFW, Battle, Economy.
 */
import { describe, expect, test, } from "bun:test";
import {
  applyReputationChange,
  applyReputationDecay,
  clampReputation,
  createReputationScore,
  getReputationTier,
  REPUTATION_TIERS,
} from "./reputation";

describe("getReputationTier", () => {
  test("maps each tier boundary value correctly", () => {
    expect(getReputationTier(-100,)).toBe("hostile");
    expect(getReputationTier(-51,)).toBe("hostile");
    expect(getReputationTier(-50,)).toBe("unfriendly");
    expect(getReputationTier(-21,)).toBe("unfriendly");
    expect(getReputationTier(-20,)).toBe("neutral");
    expect(getReputationTier(20,)).toBe("neutral");
    expect(getReputationTier(21,)).toBe("friendly");
    expect(getReputationTier(50,)).toBe("friendly");
    expect(getReputationTier(51,)).toBe("allied");
    expect(getReputationTier(75,)).toBe("allied");
    expect(getReputationTier(76,)).toBe("devoted");
    expect(getReputationTier(100,)).toBe("devoted");
  });

  test("clamps out-of-range input before tier lookup", () => {
    expect(getReputationTier(150,)).toBe("devoted");
    expect(getReputationTier(-150,)).toBe("hostile");
  });

  test("tier table bounds are consistent and contiguous", () => {
    const order = ["hostile", "unfriendly", "neutral", "friendly", "allied", "devoted",] as const;
    for (let i = 1; i < order.length; i++) {
      const prev = REPUTATION_TIERS[order[i - 1]!];
      const curr = REPUTATION_TIERS[order[i]!];
      expect(prev.max + 1,).toBe(curr.min);
    }
  });
});

describe("clampReputation", () => {
  test("clamps to [-100, +100]", () => {
    expect(clampReputation(-100,)).toBe(-100);
    expect(clampReputation(100,)).toBe(100);
    expect(clampReputation(-200,)).toBe(-100);
    expect(clampReputation(200,)).toBe(100);
  });

  test("passes through in-range values", () => {
    expect(clampReputation(0,)).toBe(0);
    expect(clampReputation(42,)).toBe(42);
    expect(clampReputation(-42,)).toBe(-42);
  });
});

describe("createReputationScore", () => {
  test("defaults to neutral 0 with empty modifiers", () => {
    const score = createReputationScore({ source: "social", });
    expect(score.value).toBe(0);
    expect(score.tier).toBe("neutral");
    expect(score.source).toBe("social");
    expect(score.decay_rate).toBe(0);
    expect(score.modifiers).toEqual([]);
    expect(score.last_modified).toBeInstanceOf(Date);
  });

  test("uses provided initial value and computes tier", () => {
    const score = createReputationScore({ source: "faction", initial_value: 60, });
    expect(score.value).toBe(60);
    expect(score.tier).toBe("allied");
  });

  test("clamps initial value and honors decay_rate", () => {
    const score = createReputationScore({
      source: "nsfw",
      initial_value: 250,
      decay_rate: 0.5,
    });
    expect(score.value).toBe(100);
    expect(score.tier).toBe("devoted");
    expect(score.decay_rate).toBe(0.5);
  });
});

describe("applyReputationChange", () => {
  test("applies a positive delta and records the modifier", () => {
    const base = createReputationScore({ source: "social", initial_value: 10, });
    const next = applyReputationChange(base, 15, "quest completed", { quest_id: "q1", });
    expect(next.value).toBe(25);
    expect(next.tier).toBe(getReputationTier(25));
    expect(next.modifiers).toHaveLength(1);
    expect(next.modifiers[0]).toMatchObject({ source: "quest completed", amount: 15, reason: "quest completed", context: { quest_id: "q1" } });
  });

  test("clamps at +100 and keeps prior modifiers", () => {
    const base = createReputationScore({ source: "social", initial_value: 90, });
    const once = applyReputationChange(base, 50, "heroic act");
    expect(once.value).toBe(100);
    const twice = applyReputationChange(once, 10, "another deed");
    expect(twice.value).toBe(100);
    expect(twice.modifiers).toHaveLength(2);
  });

  test("clamps at -100", () => {
    const base = createReputationScore({ source: "faction", initial_value: -90, });
    const next = applyReputationChange(base, -50, "betrayal");
    expect(next.value).toBe(-100);
  });
});

describe("applyReputationDecay", () => {
  test("decays positive values toward zero", () => {
    const base = createReputationScore({ source: "social", initial_value: 50, decay_rate: 2, });
    const next = applyReputationDecay(base, 3);
    expect(next.value).toBe(44);
    expect(next.tier).toBe(getReputationTier(44));
  });

  test("decays negative values toward zero and stops at neutral", () => {
    const base = createReputationScore({ source: "social", initial_value: -30, decay_rate: 2, });
    const next = applyReputationDecay(base, 5);
    expect(next.value).toBe(-20);
    const settled = applyReputationDecay(next, 100);
    expect(settled.value).toBe(0);
  });
});
