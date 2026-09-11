// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for initiative rolls and ordering.
 *
 * The d20 uses `crypto.getRandomValues`, so rolls are rigged by filling
 * the entropy buffer: fill `19` rolls 20 on a d20 (`19 % 20 + 1`).
 */
import { describe, expect, test, } from "bun:test";
import { rollInitiative, sortByInitiative, } from "./initiative";
import type { Combatant, } from "./types";

const STATS = { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10, };

function combatant(id: string, initiative: number, dex: number,): Combatant {
  return {
    id,
    name: id,
    hp: 10,
    maxHp: 10,
    ac: 10,
    stats: { ...STATS, dex, },
    level: 1,
    isNpc: false,
    initiative,
    initiativeMod: 0,
    hasActed: false,
    actions: 1,
    bonusActions: 1,
    reactions: 1,
    conditions: [],
  };
}

/** Run `fn` with crypto entropy fixed to `fill` (restored afterwards). */
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

describe("rollInitiative", () => {
  test("d20 plus DEX modifier", () => {
    // DEX 14 → +2; rigged d20 → 20; total 22.
    const result = withRiggedCrypto(19, () =>
      rollInitiative(combatant("c1", 0, 14,),),);
    expect(result,).toEqual({ roll: 20, dexMod: 2, total: 22, },);
  });
});

describe("sortByInitiative", () => {
  test("highest first, ties broken by DEX", () => {
    const slow = combatant("slow", 18, 10,);
    const fast = combatant("fast", 12, 18,);
    const tiedHigh = combatant("tied-high", 12, 16,);
    const tiedLow = combatant("tied-low", 12, 8,);
    const out = sortByInitiative([tiedLow, fast, tiedHigh, slow,],);
    expect(out.map((c,) => c.id,),).toEqual(["slow", "fast", "tied-high", "tied-low",],);
  });

  test("does not mutate the input", () => {
    const input = [combatant("a", 5, 10,), combatant("b", 15, 10,)];
    sortByInitiative(input,);
    expect(input.map((c,) => c.id,),).toEqual(["a", "b",],);
  });
});
