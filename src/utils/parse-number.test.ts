// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";

import { parseFloatOr, parseIntOr, safeParseFloat, safeParseInt, } from "./parse-number";

describe("safeParseInt", () => {
  test("parses valid integers", () => {
    expect(safeParseInt("42",),).toEqual({ ok: true, value: 42, },);
    expect(safeParseInt(" -7 ",),).toEqual({ ok: true, value: -7, },);
    expect(safeParseInt("+5",),).toEqual({ ok: true, value: 5, },);
  });

  test("rejects malformed input", () => {
    expect(safeParseInt("12abc",).ok,).toBe(false,);
    expect(safeParseInt("",).ok,).toBe(false,);
    expect(safeParseInt("   ",).ok,).toBe(false,);
    expect(safeParseInt("3.14",).ok,).toBe(false,);
    expect(safeParseInt("Infinity",).ok,).toBe(false,);
    expect(safeParseInt("NaN",).ok,).toBe(false,);
  });
});

describe("safeParseFloat", () => {
  test("parses valid finite numbers", () => {
    expect(safeParseFloat("3.14",),).toEqual({ ok: true, value: 3.14, },);
    expect(safeParseFloat(" -0.5 ",),).toEqual({ ok: true, value: -0.5, },);
    expect(safeParseFloat("2",),).toEqual({ ok: true, value: 2, },);
  });

  test("rejects non-finite and garbage input", () => {
    expect(safeParseFloat("abc",).ok,).toBe(false,);
    expect(safeParseFloat("1.2.3",).ok,).toBe(false,);
    expect(safeParseFloat("Infinity",).ok,).toBe(false,);
    expect(safeParseFloat("",).ok,).toBe(false,);
  });
});

describe("parseIntOr / parseFloatOr", () => {
  test("return parsed value on success", () => {
    expect(parseIntOr("7", 0,),).toBe(7,);
    expect(parseFloatOr("1.5", 0,),).toBe(1.5,);
  });

  test("return fallback on failure", () => {
    expect(parseIntOr("x", 0,),).toBe(0,);
    expect(parseIntOr("9z", -1,),).toBe(-1,);
    expect(parseFloatOr("", 2.5,),).toBe(2.5,);
  });
});
