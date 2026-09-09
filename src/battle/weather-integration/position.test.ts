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

  // ── Edge cases ──────────────────────────────────────────────

  test("extreme-vs-extreme is level (no bonus)", () => {
    expect(calculateElevationBonus("extreme", "extreme",),).toEqual({ attackBonus: 0, damageBonus: 0, },);
  });

  test("high-vs-medium grants exactly one tier of advantage", () => {
    expect(calculateElevationBonus("high", "medium",),).toEqual({ attackBonus: 2, damageBonus: 1, },);
  });

  test("extreme-vs-medium grants two tiers of advantage", () => {
    expect(calculateElevationBonus("extreme", "medium",),).toEqual({ attackBonus: 4, damageBonus: 2, },);
  });

  test("damageBonus tracks the tier delta on disadvantage (Math.min(0, diff))", () => {
    // Implementation: damageBonus = Math.min(0, difference). For a
    // 1-tier disadvantage (difference = -1) this is -1, not 0. The
    // floor only kicks in when the implementation chooses to apply it.
    const result = calculateElevationBonus("medium", "high",);
    expect(result.attackBonus,).toBe(-2,);
    expect(result.damageBonus,).toBe(-1,);
  });

  test("high-vs-extreme grants a single-tier negative swing", () => {
    expect(calculateElevationBonus("high", "extreme",),).toEqual({ attackBonus: -2, damageBonus: -1, },);
  });

  test("medium-vs-extreme is a two-tier disadvantage", () => {
    expect(calculateElevationBonus("medium", "extreme",),).toEqual({ attackBonus: -4, damageBonus: -2, },);
  });
});
