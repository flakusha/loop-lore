// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration-schema coverage — terrain modifiers for every terrain type
 * (plus an unknown/damaged terrain) and dice-roll invariants, modifier
 * application, advantage handling, and skill-check wiring.
 */
import { describe, expect, test, } from "bun:test";
import {
  type DiceType,
  makeSkillCheck,
  rollDice,
  type RollModifier,
  STANDARD_DC,
} from "./dice.js";
import {
  getCombatTerrainModifiers,
  type TerrainType,
} from "./terrain.js";

describe("getCombatTerrainModifiers", () => {
  test("forest grants dodge cover but hurts ranged accuracy", () => {
    const mods = getCombatTerrainModifiers("forest",);
    expect(mods,).toHaveLength(2,);
    expect(mods.map((m,) => m.id),).toEqual(["forest_dodge", "forest_ranged",],);
    expect(mods[0],).toMatchObject({ affectedStat: "dodgeChance", value: 15, source: "terrain", },);
    expect(mods[1],).toMatchObject({ affectedStat: "accuracy", value: -10, },);
  });

  test("mountain trades defense for speed", () => {
    const mods = getCombatTerrainModifiers("mountain",);
    expect(mods,).toHaveLength(2,);
    expect(mods.map((m,) => m.id),).toEqual(["mountain_defense", "mountain_speed",],);
  });

  test("open ground, desert, urban, and dungeon are unmodified", () => {
    for (const t of ["open", "desert", "urban", "dungeon",] as TerrainType[]) {
      expect(getCombatTerrainModifiers(t,),).toEqual([],);
    }
  });

  test("swamp slows and clumsies", () => {
    const mods = getCombatTerrainModifiers("swamp",);
    expect(mods.map((m,) => m.id),).toEqual(["swamp_speed", "swamp_dodge",],);
    expect(mods[0]?.value,).toBe(-20,);
  });

  test("underwater heavily slows but boosts water magic (percentage)", () => {
    const mods = getCombatTerrainModifiers("underwater",);
    expect(mods,).toHaveLength(2,);
    const magic = mods.find((m,) => m.id === "water_magic");
    expect(magic?.isPercentage,).toBe(true,);
    expect(magic?.value,).toBe(20,);
  });

  test("damaged input — unknown terrain string yields no modifiers", () => {
    expect(getCombatTerrainModifiers("volcano" as TerrainType,),).toEqual([],);
    expect(getCombatTerrainModifiers("" as TerrainType,),).toEqual([],);
  });
});

describe("STANDARD_DC", () => {
  test("pins the six difficulty values", () => {
    expect(STANDARD_DC["trivial"]?.value,).toBe(5,);
    expect(STANDARD_DC["easy"]?.value,).toBe(10,);
    expect(STANDARD_DC["medium"]?.value,).toBe(15,);
    expect(STANDARD_DC["hard"]?.value,).toBe(20,);
    expect(STANDARD_DC["very_hard"]?.value,).toBe(25,);
    expect(STANDARD_DC["legendary"]?.value,).toBe(30,);
  });
});

describe("rollDice", () => {
  test("results stay within die faces and match the requested count", () => {
    for (const type of ["d4", "d6", "d8", "d10", "d12", "d20", "d100",] as DiceType[]) {
      const sides = Number(type.slice(1,),);
      const roll = rollDice(type, 3,);
      expect(roll.results,).toHaveLength(3,);
      for (const r of roll.results) {
        expect(r,).toBeGreaterThanOrEqual(1,);
        expect(r,).toBeLessThanOrEqual(sides,);
      }
      expect(roll.total,).toBeGreaterThanOrEqual(0,);
      expect(roll.type,).toBe(type,);
      expect(roll.count,).toBe(3,);
    }
  });

  test("zero dice yields an empty result with total zero", () => {
    const roll = rollDice("d6", 0,);
    expect(roll.results,).toEqual([],);
    expect(roll.total,).toBe(0,);
  });

  test("bonus and penalty modifiers shift the total", () => {
    const mods: RollModifier[] = [
      { source: "bless", value: 1000, type: "bonus", },
      { source: "curse", value: -100, type: "penalty", },
    ];
    const roll = rollDice("d6", 1, mods,);
    const base = roll.results.reduce((a, b,) => a + b, 0,);
    expect(roll.total,).toBe(base + 900,);
    expect(roll.modifiers,).toEqual(mods,);
  });

  test("a crushing penalty clamps the total at zero, never negative", () => {
    const roll = rollDice("d6", 1, [{ source: "doom", value: -100000, type: "penalty", },],);
    expect(roll.total,).toBe(0,);
  });

  test("critical flags only ever fire on a d20", () => {
    for (let i = 0; i < 25; i++) {
      const roll = rollDice("d12", 1,);
      expect(roll.criticalSuccess,).toBe(false,);
      expect(roll.criticalFailure,).toBe(false,);
    }
  });

  test("d20 critical flags agree with the natural roll", () => {
    for (let i = 0; i < 50; i++) {
      const roll = rollDice("d20", 1,);
      expect(roll.criticalSuccess,).toBe(roll.results[0] === 20,);
      expect(roll.criticalFailure,).toBe(roll.results[0] === 1,);
    }
  });

  test("advantage and disadvantage never produce negative totals", () => {
    const adv = rollDice("d20", 1, [{ source: "t", value: 0, type: "advantage", },],);
    const dis = rollDice("d20", 1, [{ source: "t", value: 0, type: "disadvantage", },],);
    expect(adv.total,).toBeGreaterThanOrEqual(0,);
    expect(dis.total,).toBeGreaterThanOrEqual(0,);
    // Opposing advantage+disadvantage cancel out to a straight roll.
    const both = rollDice("d20", 1, [
      { source: "a", value: 0, type: "advantage", },
      { source: "d", value: 0, type: "disadvantage", },
    ],);
    expect(both.results,).toHaveLength(1,);
  });
});

describe("makeSkillCheck", () => {
  test("margin equals roll total minus DC and success follows the rules", () => {
    for (let i = 0; i < 30; i++) {
      const dc = STANDARD_DC["medium"]!;
      const check = makeSkillCheck(5, dc,);
      expect(check.margin,).toBe(check.roll.total - dc.value,);
      expect(check.success,).toBe(
        check.criticalSuccess || (!check.criticalFailure && check.margin >= 0),
      );
      expect(check.criticalSuccess,).toBe(check.roll.criticalSuccess,);
      expect(check.criticalFailure,).toBe(check.roll.criticalFailure,);
    }
  });

  test("a huge bonus succeeds on every non-fumbled roll", () => {
    let sawNonFumble = false;
    for (let i = 0; i < 60; i++) {
      const check = makeSkillCheck(1000, STANDARD_DC["legendary"]!,);
      if (!check.criticalFailure) {
        sawNonFumble = true;
        expect(check.success,).toBe(true,);
      }
    }
    expect(sawNonFumble,).toBe(true,);
  });

  test("extra modifiers are forwarded into the roll", () => {
    const extra: RollModifier[] = [{ source: "guidance", value: 4, type: "bonus", },];
    const check = makeSkillCheck(0, STANDARD_DC["trivial"]!, extra,);
    expect(check.roll.modifiers.map((m,) => m.source),).toContain("guidance",);
  });
});
