// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { calculateCoverBonus, calculateElevationBonus, } from "./position.ts";

describe("calculateCoverBonus", () => {
  test("cover tiers grant expected defense", () => {
    expect(calculateCoverBonus("none",),).toBe(0,);
    expect(calculateCoverBonus("half",),).toBe(2,);
    expect(calculateCoverBonus("three_quarters",),).toBe(5,);
    expect(calculateCoverBonus("full",),).toBe(10,);
  });
});

describe("calculateElevationBonus", () => {
  test("higher attacker gains +2 attack and +1 damage per tier", () => {
    expect(calculateElevationBonus("high", "low",),).toEqual({ attackBonus: 4, damageBonus: 2, },);
    expect(calculateElevationBonus("medium", "low",),).toEqual({ attackBonus: 2, damageBonus: 1, },);
  });

  test("extreme height over low ground scales linearly", () => {
    expect(calculateElevationBonus("extreme", "low",),).toEqual({ attackBonus: 6, damageBonus: 3, },);
  });

  test("level ground grants no bonus", () => {
    expect(calculateElevationBonus("medium", "medium",),).toEqual({ attackBonus: 0, damageBonus: 0, },);
  });

  test("lower attacker takes mirrored penalties", () => {
    expect(calculateElevationBonus("low", "high",),).toEqual({ attackBonus: -4, damageBonus: -2, },);
    expect(calculateElevationBonus("low", "medium",),).toEqual({ attackBonus: -2, damageBonus: -1, },);
  });
});
