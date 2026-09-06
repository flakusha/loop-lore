import { describe, expect, it, } from "bun:test";
import { grantsAsi, hpOnLevelUp, } from "./levelup";

describe("rpg/xp/levelup (real logic)", () => {
  it("first level uses max hit die + con mod", () => {
    expect(hpOnLevelUp(8, 2, true,),).toBe(10,);
    expect(hpOnLevelUp(6, -1, true,),).toBe(5,);
  });
  it("subsequent levels use average + con mod (min 1)", () => {
    expect(hpOnLevelUp(8, 2,),).toBeGreaterThanOrEqual(1,);
    expect(hpOnLevelUp(6, -10,),).toBe(1,); // clamped
  });
  it("grantsAsi at specific levels", () => {
    expect(grantsAsi(4,),).toBe(true,);
    expect(grantsAsi(5,),).toBe(false,);
    expect(grantsAsi(8,),).toBe(true,);
  });
});
