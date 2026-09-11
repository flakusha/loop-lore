// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for damage application and healing (pure, no dice). */
import { describe, expect, test, } from "bun:test";
import { applyDamage, healCombatant, } from "./damage";
import type { Combatant, } from "./types";

const STATS = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };

function fighter(hp: number,): Combatant {
  return {
    id: "f1",
    name: "Fighter",
    hp,
    maxHp: 20,
    ac: 15,
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

describe("applyDamage", () => {
  test("reduces HP without defeat or overkill", () => {
    const { updated, overkill, defeated, } = applyDamage(fighter(20,), 7,);
    expect(updated.hp,).toBe(13,);
    expect(overkill,).toBe(0,);
    expect(defeated,).toBe(false,);
  });

  test("floors at zero HP and reports overkill", () => {
    const { updated, overkill, defeated, } = applyDamage(fighter(5,), 12,);
    expect(updated.hp,).toBe(0,);
    expect(overkill,).toBe(7,);
    expect(defeated,).toBe(true,);
  });

  test("exact lethal damage defeats with zero overkill", () => {
    const { updated, overkill, defeated, } = applyDamage(fighter(8,), 8,);
    expect(updated.hp,).toBe(0,);
    expect(overkill,).toBe(0,);
    expect(defeated,).toBe(true,);
  });

  test("does not mutate the input", () => {
    const before = fighter(20,);
    applyDamage(before, 7,);
    expect(before.hp,).toBe(20,);
  });
});

describe("healCombatant", () => {
  test("restores HP up to the max", () => {
    expect(healCombatant(fighter(10,), 5,).hp,).toBe(15,);
    expect(healCombatant(fighter(18,), 10,).hp,).toBe(20,);
  });
});
