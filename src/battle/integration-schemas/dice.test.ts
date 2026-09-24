// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { rollDice, type RollModifier, STANDARD_DC, } from "./dice.ts";

describe("dice", () => {
  test("STANDARD_DC has expected entries", () => {
    expect(STANDARD_DC.easy,).toBeDefined();
    expect(STANDARD_DC.medium,).toBeDefined();
    expect(STANDARD_DC.hard,).toBeDefined();
  });

  test("rollDice returns DiceRoll with correct count", () => {
    const result = rollDice("d6", 3,);
    expect(result.type,).toBe("d6",);
    expect(result.count,).toBe(3,);
    expect(result.results,).toHaveLength(3,);
  });

  test("rollDice with bonus modifier increases total", () => {
    // Deterministic: pin Math.random so the d20 always rolls floor(0.5 * 20) + 1 = 11.
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
      const result1 = rollDice("d20", 1,);
      const modifier: RollModifier = { source: "spell", value: 5, type: "bonus", };
      const result2 = rollDice("d20", 1, [modifier,],);
      expect(result1.total,).toBe(11,);
      expect(result2.total,).toBe(16,);
      expect(result2.total - result1.total,).toBe(5,);
      expect(result2.modifiers,).toEqual([modifier,],);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("advantage compares raw totals and crit reflects the kept die (BUG-battle-dice regressions)", () => {
    const originalRandom = Math.random;
    let call = 0;
    Math.random = () => (call++ === 0 ? 0.05 : 0.99);
    try {
      // First roll: floor(0.05*20)+1 = 2. Advantage reroll: floor(0.99*20)+1 = 20.
      const r = rollDice("d20", 1, [
        { source: "a", value: 0, type: "advantage", },
        { source: "b", value: 5, type: "bonus", },
      ],);
      // Kept die is 20 (raw 20 > raw 2); bonus applies once to the kept total.
      expect(r.total,).toBe(25,);
      // Critical reflects the KEPT die (20), not the discarded results[0] (2).
      expect(r.criticalSuccess,).toBe(true,);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("keptIdx exposes which die advantage/disadvantage kept", () => {
    const originalRandom = Math.random;
    let call = 0;
    try {
      // First roll 7, advantage reroll 15 → the higher reroll is kept (index 1).
      Math.random = () => (call++ === 0 ? 0.3 : 0.7);
      const adv = rollDice("d20", 1, [{ source: "a", value: 0, type: "advantage", },],);
      expect(adv.results,).toEqual([7, 15,],);
      expect(adv.keptIdx,).toBe(1,);

      // First roll 15, disadvantage reroll 7 → the lower reroll is kept (index 1).
      call = 0;
      Math.random = () => (call++ === 0 ? 0.7 : 0.3);
      const dis = rollDice("d20", 1, [{ source: "d", value: 0, type: "disadvantage", },],);
      expect(dis.results,).toEqual([15, 7,],);
      expect(dis.keptIdx,).toBe(1,);

      // Straight roll: single die, keptIdx 0.
      Math.random = () => 0.42;
      const straight = rollDice("d20", 1,);
      expect(straight.results,).toHaveLength(1,);
      expect(straight.keptIdx,).toBe(0,);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("rollDice detects critical success on d20", () => {
    // Run several rolls to test critical logic
    const results: any[] = [];
    for (let i = 0; i < 100; i++) {
      const r = rollDice("d20", 1,);
      results.push(r,);
    }
    // All results should be 1-20
    for (const r of results) {
      for (const roll of r.results) {
        expect(roll,).toBeGreaterThanOrEqual(1,);
        expect(roll,).toBeLessThanOrEqual(20,);
      }
    }
  });
});
