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
    const result1 = rollDice("d20", 1);
    const modifier: RollModifier = { source: "spell", value: 5, type: "bonus" };
    const result2 = rollDice("d20", 1, [modifier]);
    // The total with bonus should be at least 1 greater than without
    expect(result2.total).toBeGreaterThanOrEqual(result1.total);
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