// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for stat-block range validation ([1, 30] on every ability). */
import { describe, expect, test, } from "bun:test";
import type { StatBlock, } from "./types";
import { defaultStatBlock, validateStatBlock, } from "./validation";

const VALID: StatBlock = { str: 8, dex: 14, con: 12, int: 10, wis: 13, cha: 15, };

describe("validateStatBlock", () => {
  test("accepts in-range blocks including the boundaries", () => {
    expect(validateStatBlock(VALID,),).toBe(true,);
    expect(
      validateStatBlock({ str: 1, dex: 1, con: 1, int: 30, wis: 30, cha: 30, },),
    ).toBe(true,);
  });

  test("rejects below-minimum and above-maximum values", () => {
    expect(validateStatBlock({ ...VALID, str: 0, },),).toBe(false,);
    expect(validateStatBlock({ ...VALID, cha: 31, },),).toBe(false,);
  });
});

describe("statCost", () => {
  test("matches the table inside 8-15", async () => {
    const { POINT_BUY_COST, statCost, } = await import("./types");
    for (const [stat, cost,] of Object.entries(POINT_BUY_COST,)) {
      expect(statCost(Number(stat,),),).toBe(cost,);
    }
  });

  test("below-floor is free, above-ceiling caps at table max", async () => {
    const { statCost, } = await import("./types");
    expect(statCost(6,),).toBe(0,);
    expect(statCost(1,),).toBe(0,);
    expect(statCost(16,),).toBe(9,);
    expect(statCost(30,),).toBe(9,);
  });
});

describe("defaultStatBlock", () => {
  test("is all tens and valid", () => {
    const block = defaultStatBlock();
    expect(block,).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, },);
    expect(validateStatBlock(block,),).toBe(true,);
  });
});
