// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { makeAttackRoll, } from "./attacks.ts";

/**
 * Regression tests for criticalHit under advantage/disadvantage
 * (BUG-critical-hit-rolls-ignore-advantage): the natural-roll threshold
 * must consult the KEPT die (`results[keptIdx]`), not `results[0]`,
 * which under advantage/disadvantage may be the discarded original.
 *
 * Deterministic: Math.random is pinned so the d20 sequence is exact
 * (die = floor(random * 20) + 1), matching the seeding pattern in
 * integration-schemas/dice.test.ts.
 */
describe("makeAttackRoll criticalHit under advantage/disadvantage", () => {
  test("advantage discarding a 1 and keeping a 20 reports criticalHit", () => {
    const originalRandom = Math.random;
    let call = 0;
    Math.random = () => (call++ === 0 ? 0.0 : 0.95);
    try {
      const result = makeAttackRoll(0, 10, [{ source: "test", value: 0, type: "advantage", },],);

      expect(result.roll.results,).toEqual([1, 20,],);
      expect(result.roll.keptIdx,).toBe(1,);
      expect(result.criticalHit,).toBe(true,);
      expect(result.narration,).toContain("Critical hit!",);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("advantage with a sub-20 threshold crits on the kept die, not the discarded one", () => {
    const originalRandom = Math.random;
    let call = 0;
    // First roll 5, advantage reroll 19 → kept die 19 ≥ threshold 18 crits;
    // the discarded results[0]=5 must not suppress it.
    Math.random = () => (call++ === 0 ? 0.2 : 0.9);
    try {
      const result = makeAttackRoll(0, 10, [{ source: "test", value: 0, type: "advantage", },], 18,);

      expect(result.roll.results,).toEqual([5, 19,],);
      expect(result.roll.keptIdx,).toBe(1,);
      expect(result.criticalHit,).toBe(true,);
      expect(result.narration,).toContain("Critical hit!",);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("disadvantage keeping a low die does not crit on the discarded high die", () => {
    const originalRandom = Math.random;
    let call = 0;
    // First roll 20, disadvantage reroll 3 → kept die is 3. The discarded
    // results[0]=20 must NOT trigger a critical hit.
    Math.random = () => (call++ === 0 ? 0.95 : 0.1);
    try {
      const result = makeAttackRoll(0, 10, [{ source: "test", value: 0, type: "disadvantage", },],);

      expect(result.roll.results,).toEqual([20, 3,],);
      expect(result.roll.keptIdx,).toBe(1,);
      expect(result.criticalHit,).toBe(false,);
      expect(result.criticalMiss,).toBe(false,);
      expect(result.narration,).not.toContain("Critical hit!",);
    } finally {
      Math.random = originalRandom;
    }
  });
});
