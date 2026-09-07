import { describe, expect, it, } from "bun:test";
import { parseParamSize, safeParseFloat, safeParseInt, } from "./parse-number";

describe("parse-number (real logic)", () => {
  it("safeParseInt parses valid integer", () => {
    expect(safeParseInt("42",).ok,).toBe(true,);
    const r42 = safeParseInt("42",);
    if (r42.ok) { expect(r42.value,).toBe(42,); }
  });
  it("safeParseInt rejects non-integer", () => {
    expect(safeParseInt("3.14",).ok,).toBe(false,);
    expect(safeParseInt("abc",).ok,).toBe(false,);
    expect(safeParseInt("",).ok,).toBe(false,);
  });
  it("safeParseFloat parses float", () => {
    expect(safeParseFloat("3.14",).ok,).toBe(true,);
    const rPi = safeParseFloat("3.14",);
    if (rPi.ok) { expect(rPi.value,).toBe(3.14,); }
  });
  it("safeParseFloat rejects non-number", () => {
    expect(safeParseFloat("hello",).ok,).toBe(false,);
    expect(safeParseFloat("",).ok,).toBe(false,);
  });
});

describe("parseParamSize", () => {
  it("scales B-suffixed sizes to billions", () => {
    expect(parseParamSize("8B",),).toBe(8,);
    expect(parseParamSize("13B",),).toBe(13,);
    expect(parseParamSize("3.2B",),).toBe(3.2,);
  });

  it("scales M-suffixed sizes to billions", () => {
    expect(parseParamSize("110M",),).toBe(0.11,);
    expect(parseParamSize("500M",),).toBe(0.5,);
  });

  it("treats bare numbers as already in billions", () => {
    expect(parseParamSize("13",),).toBe(13,);
    expect(parseParamSize("7",),).toBe(7,);
  });

  it("returns NaN for malformed or empty input", () => {
    expect(parseParamSize("huge",),).toBeNaN();
    expect(parseParamSize("",),).toBeNaN();
    expect(parseParamSize("B",),).toBeNaN();
  });
});
