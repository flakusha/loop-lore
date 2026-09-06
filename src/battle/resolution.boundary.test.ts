// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";
createLogger();
import {
  calculateAttackRoll,
  calculateDamage,
  calculateDefenseRoll,
  makeAttackRoll,
  makeSavingThrow,
  processCombatRound,
  rollDice,
} from "./index";

describe("battle resolution boundary", () => {
  test("processCombatRound is callable with empty combatants", () => {
    const r = processCombatRound([], {},);
    expect(r.round,).toBe(0,);
    expect(r.actions,).toEqual([],);
  });

  test("calculateAttackRoll empty mods returns AttackRollResult", () => {
    const r = calculateAttackRoll(0, 10,);
    expect(r,).toBeDefined();
    expect(typeof r.roll,).toBe("object",);
  });

  test("calculateDefenseRoll returns roll/success/margin", () => {
    const r = calculateDefenseRoll(0, 10,);
    expect(typeof r.success,).toBe("boolean",);
    expect(typeof r.margin,).toBe("number",);
  });

  test("calculateAttackRoll with advantage flag", () => {
    const r = calculateAttackRoll(2, 12, true,);
    expect(r.roll,).toBeDefined();
  });

  test("calculateDefenseRoll with disadvantage flag", () => {
    const r = calculateDefenseRoll(0, 10, false, true,);
    expect(typeof r.success,).toBe("boolean",);
  });

  test("calculateDamage returns DamageResult with non-negative total", () => {
    const r = calculateDamage(5, 0,);
    expect(r.total,).toBeGreaterThanOrEqual(0,);
  });

  test("rollDice d20 returns 1..20", () => {
    for (let i = 0; i < 20; i++) {
      const v = rollDice(20,);
      expect(v,).toBeGreaterThanOrEqual(1,);
      expect(v,).toBeLessThanOrEqual(20,);
    }
  });

  test("makeAttackRoll with empty modifiers array", () => {
    const r = makeAttackRoll(0, 10, [],);
    expect(r.roll,).toBeDefined();
  });

  test("makeSavingThrow against no dc", () => {
    const r = makeSavingThrow(0, { name: "fort", value: 0, description: "fort", }, [],);
    expect(r.success,).toBeDefined();
  });
});
