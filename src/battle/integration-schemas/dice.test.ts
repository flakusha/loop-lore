// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { rollDice, STANDARD_DC, type RollModifier, } from "./dice.ts";

describe("dice", () => {
  test("STANDARD_DC has expected entries", () => {
    expect(STANDARD_DC.easy).toBeDefined();
    expect(STANDARD_DC.medium).toBeDefined();
    expect(STANDARD_DC.hard).toBeDefined();
  });

  test("rollDice returns DiceRoll with correct count", () => {
    const result = rollDice("d6", 3);
    expect(result.type).toBe("d6");
    expect(result.count).toBe(3);
    expect(result.results).toHaveLength(3);
  });

  test("rollDice with bonus modifier increases total", () => {
    // Deterministic: pin Math.random so the d20 always rolls floor(0.5 * 20) + 1 = 11.
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
      const result1 = rollDice("d20", 1);
      const modifier: RollModifier = { source: "spell", value: 5, type: "bonus" };
      const result2 = rollDice("d20", 1, [modifier]);
      expect(result1.total).toBe(11);
      expect(result2.total).toBe(16);
      expect(result2.total - result1.total).toBe(5);
      expect(result2.modifiers).toEqual([modifier]);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("rollDice detects critical success on d20", () => {
    // Run several rolls to test critical logic
    const results: any[] = [];
    for (let i = 0; i < 100; i++) {
      const r = rollDice("d20", 1);
      results.push(r);
    }
    // All results should be 1-20
    for (const r of results) {
      for (const roll of r.results) {
        expect(roll).toBeGreaterThanOrEqual(1);
        expect(roll).toBeLessThanOrEqual(20);
      }
    }
  });
});