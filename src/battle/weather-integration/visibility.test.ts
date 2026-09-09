// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { calculateVisibility, } from "./visibility.ts";

describe("calculateVisibility", () => {
  test("base visibility per weather at noon", () => {
    expect(calculateVisibility("clear", 12,),).toBe(100,);
    expect(calculateVisibility("rain", 12,),).toBe(70,);
    expect(calculateVisibility("storm", 12,),).toBe(40,);
    expect(calculateVisibility("snow", 12,),).toBe(60,);
    expect(calculateVisibility("fog", 12,),).toBe(30,);
    expect(calculateVisibility("wind", 12,),).toBe(80,);
    expect(calculateVisibility("heatwave", 12,),).toBe(90,);
    expect(calculateVisibility("cold_snap", 12,),).toBe(85,);
  });

  test("night halves visibility", () => {
    expect(calculateVisibility("clear", 22,),).toBe(50,);
    expect(calculateVisibility("rain", 0,),).toBe(35,);
    expect(calculateVisibility("fog", 3,),).toBe(15,);
  });

  test("dawn and dusk scale visibility to 70%", () => {
    expect(calculateVisibility("clear", 19,),).toBe(70,);
    expect(calculateVisibility("clear", 6,),).toBe(70,);
    expect(calculateVisibility("clear", 7,),).toBe(70,);
    expect(calculateVisibility("clear", 18,),).toBe(70,);
  });

  test("day boundaries keep full visibility", () => {
    expect(calculateVisibility("clear", 8,),).toBe(100,);
    expect(calculateVisibility("clear", 17,),).toBe(100,);
  });

  test("night boundary starts at 20:00", () => {
    expect(calculateVisibility("clear", 20,),).toBe(50,);
    expect(calculateVisibility("wind", 5,),).toBe(40,);
  });

  // ── Edge cases ──────────────────────────────────────────────

  test("result is always clamped to [10, 100]", () => {
    for (let hour = 0; hour < 24; hour++) {
      const v = calculateVisibility("fog", hour,);
      expect(v,).toBeGreaterThanOrEqual(10,);
      expect(v,).toBeLessThanOrEqual(100,);
    }
  });

  test("storm at midnight (40 * 0.5 = 20)", () => {
    expect(calculateVisibility("storm", 0,),).toBe(20,);
  });

  test("storm at 19:00 (dawn/dusk) is 40 * 0.7 = 28", () => {
    expect(calculateVisibility("storm", 19,),).toBe(28,);
  });

  test("heatwave at noon stays high (90)", () => {
    expect(calculateVisibility("heatwave", 12,),).toBe(90,);
  });

  test("heatwave at midnight is 90 * 0.5 = 45", () => {
    expect(calculateVisibility("heatwave", 23,),).toBe(45,);
  });

  test("cold_snap at dawn rounds 85 * 0.7 (59.4999... → 59)", () => {
    // 85 * 0.7 in IEEE-754 is 59.49999...; Math.round → 59.
    expect(calculateVisibility("cold_snap", 7,),).toBe(59,);
  });

  test("fog at noon stays at 30 (the floor for fog at midday)", () => {
    expect(calculateVisibility("fog", 12,),).toBe(30,);
  });

  test("hour 23 is night (50% scaling)", () => {
    expect(calculateVisibility("clear", 23,),).toBe(50,);
  });

  test("hour 5 is night (50% scaling), hour 6 is dawn (70%)", () => {
    expect(calculateVisibility("clear", 5,),).toBe(50,);
    expect(calculateVisibility("clear", 6,),).toBe(70,);
  });

  test("snow at noon stays at 60, snow at midnight is 30", () => {
    expect(calculateVisibility("snow", 12,),).toBe(60,);
    expect(calculateVisibility("snow", 0,),).toBe(30,);
  });

  test("wind at midnight is 80 * 0.5 = 40", () => {
    expect(calculateVisibility("wind", 23,),).toBe(40,);
  });
});
