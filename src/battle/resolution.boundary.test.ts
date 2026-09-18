// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";
import {
  calculateDamage,
  makeAttackRoll,
  makeSavingThrow,
  rollDice,
} from "./index";

createLogger();

describe("battle resolution boundary", () => {
  test("makeAttackRoll accepts empty modifiers and no target AC edge", () => {
    const r = makeAttackRoll(0, 10, [],);
    expect(r.roll,).toBeDefined();
    expect(typeof r.hit,).toBe("boolean",);
  });

  test("makeSavingThrow against zero-value DC", () => {
    const r = makeSavingThrow(0, { name: "fort", value: 0, description: "fort", }, [],);
    expect(typeof r.success,).toBe("boolean",);
    expect(typeof r.margin,).toBe("number",);
  });

  test("calculateDamage returns DamageResult with non-negative total", () => {
    const r = calculateDamage("2d6+3", [],);
    expect(r.totalDamage,).toBeGreaterThanOrEqual(0,);
    expect(r.type,).toBe("physical",);
  });

  test("critical damage doubles dice but not the flat bonus", () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5; // d6 -> floor(0.5*6)+1 = 4
    try {
      const r = calculateDamage("1d6+3", [], true,);
      // 4*2 + 3 = 11; the old bug produced (4+3)*2 = 14.
      expect(r.baseDamage,).toBe(11,);
    } finally {
      Math.random = originalRandom;
    }
  });

  test("rollDice d20 returns 1..20", () => {
    for (let i = 0; i < 30; i++) {
      const v = rollDice("d20",);
      expect(v.total,).toBeGreaterThanOrEqual(1,);
      expect(v.total,).toBeLessThanOrEqual(20,);
    }
  });

  test("makeAttackRoll critical miss threshold respects target AC", () => {
    const r = makeAttackRoll(-5, 10, [], 20,);
    expect(r.criticalMiss,).toBeDefined();
  });
});
