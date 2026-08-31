// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";

import { clamp, clampUnit, } from "./clamp";

describe("clamp", () => {
  test("returns value when within range", () => {
    expect(clamp(0.5, 0, 1,),).toBe(0.5,);
    expect(clamp(0, 0, 1,),).toBe(0,);
    expect(clamp(1, 0, 1,),).toBe(1,);
  });

  test("clamps to min when value below range", () => {
    expect(clamp(-0.5, 0, 1,),).toBe(0,);
    expect(clamp(-100, -10, 10,),).toBe(-10,);
  });

  test("clamps to max when value above range", () => {
    expect(clamp(1.5, 0, 1,),).toBe(1,);
    expect(clamp(99, -10, 10,),).toBe(10,);
  });

  test("supports non-unit intervals", () => {
    expect(clamp(15, 10, 20,),).toBe(15,);
    expect(clamp(5, 10, 20,),).toBe(10,);
    expect(clamp(25, 10, 20,),).toBe(20,);
  });

  test("preserves NaN (so callers can detect non-finite input)", () => {
    expect(Number.isNaN(clamp(Number.NaN, 0, 1,),),).toBe(true,);
  });
});

describe("clampUnit", () => {
  test("clamps values above 1 to 1", () => {
    expect(clampUnit(1.5,),).toBe(1,);
    expect(clampUnit(9999,),).toBe(1,);
  });

  test("clamps values below 0 to 0", () => {
    expect(clampUnit(-0.5,),).toBe(0,);
    expect(clampUnit(-9999,),).toBe(0,);
  });

  test("returns value unchanged within [0, 1]", () => {
    expect(clampUnit(0,),).toBe(0,);
    expect(clampUnit(1,),).toBe(1,);
    expect(clampUnit(0.42,),).toBe(0.42,);
  });

  test("returns fallback (0.5) for non-finite input", () => {
    expect(clampUnit(Number.NaN,),).toBe(0.5,);
    expect(clampUnit(Number.POSITIVE_INFINITY,),).toBe(0.5,);
    expect(clampUnit(Number.NEGATIVE_INFINITY,),).toBe(0.5,);
  });

  test("honors custom fallback for non-finite input", () => {
    expect(clampUnit(Number.NaN, 0,),).toBe(0,);
    expect(clampUnit(Number.NaN, 0.75,),).toBe(0.75,);
  });
});
