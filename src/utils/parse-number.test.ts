import { describe, expect, it, } from "bun:test";
import { safeParseFloat, safeParseInt, } from "./parse-number";

describe("parse-number (real logic)", () => {
  it("safeParseInt parses valid integer", () => {
    expect(safeParseInt("42",).ok,).toBe(true,);
    if (safeParseInt("42",).ok) { expect(safeParseInt("42",).value,).toBe(42,); }
  });
  it("safeParseInt rejects non-integer", () => {
    expect(safeParseInt("3.14",).ok,).toBe(false,);
    expect(safeParseInt("abc",).ok,).toBe(false,);
    expect(safeParseInt("",).ok,).toBe(false,);
  });
  it("safeParseFloat parses float", () => {
    expect(safeParseFloat("3.14",).ok,).toBe(true,);
    if (safeParseFloat("3.14",).ok) { expect(safeParseFloat("3.14",).value,).toBe(3.14,); }
  });
  it("safeParseFloat rejects non-number", () => {
    expect(safeParseFloat("hello",).ok,).toBe(false,);
    expect(safeParseFloat("",).ok,).toBe(false,);
  });
});
