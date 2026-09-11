// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for saving throws (rigged crypto — see initiative.test.ts).
 *
 * CON 14 → +2 ability mod; level 5 → +3 proficiency; rigged d20 → 20.
 */
import { describe, expect, test, } from "bun:test";
import { AdvantageMode, } from "../dice/types.js";
import { makeSavingThrow, } from "./saves";
import type { Combatant, } from "./types";

function cleric(): Combatant {
  return {
    id: "c1",
    name: "Cleric",
    hp: 30,
    maxHp: 30,
    ac: 18,
    stats: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10, },
    level: 5,
    isNpc: false,
    initiative: 0,
    initiativeMod: 0,
    hasActed: false,
    actions: 1,
    bonusActions: 1,
    reactions: 1,
    conditions: [],
  };
}

function withRiggedCrypto<T>(fill: number, fn: () => T,): T {
  const getRandomValues = crypto.getRandomValues.bind(crypto,);
  const rigged = (array: Uint32Array,): Uint32Array => array.fill(fill,);
  crypto.getRandomValues = rigged as typeof crypto.getRandomValues;
  try {
    return fn();
  } finally {
    crypto.getRandomValues = getRandomValues;
  }
}

describe("makeSavingThrow", () => {
  test("total is d20 plus ability mod plus proficiency", () => {
    const result = withRiggedCrypto(19, () => makeSavingThrow(cleric(), "con", 10,),);
    expect(result.abilityMod,).toBe(2,);
    expect(result.total,).toBe(25,);
    expect(result.success,).toBe(true,);
  });

  test("fails an unreachable DC, succeeds a trivial one", () => {
    expect(withRiggedCrypto(20, () => makeSavingThrow(cleric(), "con", 1000,)).success,).toBe(
      false,
    );
    expect(withRiggedCrypto(20, () => makeSavingThrow(cleric(), "con", -100,)).success,).toBe(
      true,
    );
  });

  test("advantage flag passes through to the roll", () => {
    const result = withRiggedCrypto(19, () =>
      makeSavingThrow(cleric(), "wis", 10, AdvantageMode.Advantage,),);
    expect(result.roll.advantageMode,).toBe(AdvantageMode.Advantage,);
    // WIS 16 → +3; total 20 + 3 + 3 = 26.
    expect(result.total,).toBe(26,);
  });
});
