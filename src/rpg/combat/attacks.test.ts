// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for attack rolls, crits, and resistance math (rigged crypto —
 * see initiative.test.ts).
 *
 * Attacker: STR 16 (+3), level 1 (+2 proficiency). Fill `10` rolls
 * d20 → 11 and d6 → 5 (`10 % 6 + 1`); fill `19` crits (d20 → 20).
 */
import { describe, expect, test, } from "bun:test";
import { makeAttackRoll, } from "./attacks";
import { DamageModifier, } from "./types";
import type { Combatant, DamageResistance, } from "./types";

const STATS = { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };

function combatant(id: string, ac: number,): Combatant {
  return {
    id,
    name: id,
    hp: 30,
    maxHp: 30,
    ac,
    stats: STATS,
    level: 1,
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

describe("makeAttackRoll", () => {
  test("hit computes damage from dice plus mods", () => {
    // d20 → 11, total 11 + 3 + 2 = 16 vs AC 10: hit, no crit.
    const result = withRiggedCrypto(10, () =>
      makeAttackRoll(combatant("att", 10,), combatant("tgt", 10,), "str", 1, 6,),);
    expect(result.hit,).toBe(true,);
    expect(result.criticalHit,).toBe(false,);
    // d6 → 5; totalBeforeResist 5 + 3 + 0 = 8.
    expect(result.damage?.totalBeforeResist,).toBe(8,);
    expect(result.damage?.finalDamage,).toBe(8,);
    expect(result.narration,).toMatch(/hits tgt for 8 physical damage/,);
  });

  test("critical hit doubles the damage dice", () => {
    const result = withRiggedCrypto(19, () =>
      makeAttackRoll(combatant("att", 10,), combatant("tgt", 10,), "str", 1, 6,),);
    expect(result.hit,).toBe(true,);
    expect(result.criticalHit,).toBe(true,);
    expect(result.damage?.baseDice.dice.length,).toBe(2,);
    expect(result.damage?.isCritical,).toBe(true,);
    expect(result.narration,).toMatch(/critically hits/,);
  });

  test("critical miss always misses with null damage", () => {
    const result = withRiggedCrypto(20, () =>
      makeAttackRoll(combatant("att", 10,), combatant("tgt", 1,), "str", 1, 6,),);
    expect(result.hit,).toBe(false,);
    expect(result.criticalMiss,).toBe(true,);
    expect(result.damage,).toBeNull();
    expect(result.narration,).toMatch(/critically misses/,);
  });

  test("plain miss names the target AC", () => {
    // d20 → 11, total 16 vs AC 100: miss (not nat20, so no crit).
    const result = withRiggedCrypto(10, () =>
      makeAttackRoll(combatant("att", 10,), combatant("tgt", 100,), "str", 1, 6,),);
    expect(result.hit,).toBe(false,);
    expect(result.narration,).toMatch(/AC 100/,);
  });

  test("resistances halve, double, or zero matching damage", () => {
    const mk = (res: DamageResistance[],) =>
      withRiggedCrypto(10, () =>
        makeAttackRoll(combatant("att", 10,), combatant("tgt", 10,), "str", 1, 6, "fire", 0, res,),);
    // totalBeforeResist: d6 → 5, +3 = 8 in all three.
    expect(mk([{ type: "fire", modifier: DamageModifier.Resistant, },]).damage?.finalDamage,).toBe(
      4,
    );
    expect(mk([{ type: "fire", modifier: DamageModifier.Vulnerable, },]).damage?.finalDamage,).toBe(
      16,
    );
    expect(mk([{ type: "fire", modifier: DamageModifier.Immune, },]).damage?.finalDamage,).toBe(0,);
    // Non-matching type ignored.
    expect(mk([{ type: "ice", modifier: DamageModifier.Immune, },]).damage?.finalDamage,).toBe(8,);
  });
});
