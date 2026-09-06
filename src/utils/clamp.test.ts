import { describe, expect, it, } from "bun:test";
import { clamp, clampUnit, } from "./clamp";

describe("utils/clamp (real logic)", () => {
  it("clamp constrains to range", () => {
    expect(clamp(1.5, 0, 1,),).toBe(1,);
    expect(clamp(-0.5, 0, 1,),).toBe(0,);
    expect(clamp(0.7, 0, 1,),).toBe(0.7,);
  });
  it("clampUnit clamps to [0,1] and falls back on NaN/Infinity", () => {
    expect(clampUnit(1.5,),).toBe(1,);
    expect(clampUnit(-0.5,),).toBe(0,);
    expect(clampUnit(NaN,),).toBe(0.5,);
    expect(clampUnit(Infinity,),).toBe(0.5,);
    expect(clampUnit(NaN, 0,),).toBe(0,);
  });
});
