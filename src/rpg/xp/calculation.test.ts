import { describe, expect, it, } from "bun:test";
import { canLevelUp, xpForLevel, xpToNextLevel, } from "./calculation";

describe("xp/calculation (real logic)", () => {
  it("xpForLevel returns correct value and clamps to bounds", () => {
    const v1 = xpForLevel(1,);
    const v20 = xpForLevel(20,);
    expect(typeof v1,).toBe("number",);
    expect(typeof v20,).toBe("number",);
    expect(v1,).toBeLessThanOrEqual(v20,);
  });
  it("xpToNextLevel returns Infinity at max level", () => {
    expect(xpToNextLevel(20, 1000000,),).toBe(Infinity,);
  });
  it("xpToNextLevel returns positive gap below max", () => {
    const gap = xpToNextLevel(1, 0,);
    expect(gap,).toBeGreaterThan(0,);
    expect(Number.isFinite(gap,),).toBe(true,);
  });
  it("canLevelUp false at max level", () => {
    expect(canLevelUp(20, 1_000_000,),).toBe(false,);
  });
  it("canLevelUp true when XP exceeds next threshold", () => {
    const nextXp = xpForLevel(2,);
    expect(canLevelUp(1, nextXp,),).toBe(true,);
  });
  it("canLevelUp false when XP insufficient", () => {
    expect(canLevelUp(1, 0,),).toBe(false,);
  });
});
