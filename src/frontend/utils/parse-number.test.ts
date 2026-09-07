import { describe, expect, test, } from "bun:test";
import {
  parseFloatOr,
  parseIntOr,
  safeParseFloat,
  safeParseInt,
} from "./parse-number";

describe("safeParseInt", () => {
  test("accepts whole base-10 integers, including padded and negative", () => {
    expect(safeParseInt("42",),).toEqual({ ok: true, value: 42, },);
    expect(safeParseInt("  -7  ",),).toEqual({ ok: true, value: -7, },);
    expect(safeParseInt("007",),).toEqual({ ok: true, value: 7, },);
    expect(safeParseInt("0",),).toEqual({ ok: true, value: 0, },);
  });

  test("rejects empty, fractional and non-numeric input", () => {
    expect(safeParseInt("",).ok,).toBe(false,);
    expect(safeParseInt("   ",).ok,).toBe(false,);
    expect(safeParseInt("3.5",).ok,).toBe(false,);
    expect(safeParseInt("abc",).ok,).toBe(false,);
    const failure = safeParseInt("abc",);
    if (!failure.ok) {
      expect(failure.error,).toBeInstanceOf(TypeError,);
      expect(failure.error.message,).toContain("abc",);
    }
  });
});

describe("safeParseFloat", () => {
  test("accepts finite numbers", () => {
    expect(safeParseFloat("2.5",),).toEqual({ ok: true, value: 2.5, },);
    expect(safeParseFloat(" -1 ",),).toEqual({ ok: true, value: -1, },);
    expect(safeParseFloat("1e3",),).toEqual({ ok: true, value: 1000, },);
  });

  test("rejects empty, non-numeric and infinite input", () => {
    expect(safeParseFloat("",).ok,).toBe(false,);
    expect(safeParseFloat("xyz",).ok,).toBe(false,);
    expect(safeParseFloat("Infinity",).ok,).toBe(false,);
    expect(safeParseFloat("NaN",).ok,).toBe(false,);
    const failure = safeParseFloat("xyz",);
    if (!failure.ok) {
      expect(failure.error.message,).toContain("finite number",);
    }
  });
});

describe("parseIntOr / parseFloatOr", () => {
  test("return parsed values for valid input", () => {
    expect(parseIntOr("12", 0,),).toBe(12,);
    expect(parseFloatOr("1.25", 0,),).toBe(1.25,);
  });

  test("fall back on invalid input", () => {
    expect(parseIntOr("not-a-number", 5,),).toBe(5,);
    expect(parseIntOr("", -1,),).toBe(-1,);
    expect(parseIntOr("2.75", 9,),).toBe(9,);
    expect(parseFloatOr("oops", 0.5,),).toBe(0.5,);
  });
});
