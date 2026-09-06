import { describe, expect, it, } from "bun:test";
import { abilityModifier, computeModifiers, } from "../../../rpg/stats/modifiers";

describe("stats/modifiers (real math)", () => {
  it("abilityModifier formula: floor((stat-10)/2)", () => {
    expect(abilityModifier(10,),).toBe(0,);
    expect(abilityModifier(12,),).toBe(1,);
    expect(abilityModifier(14,),).toBe(2,);
    expect(abilityModifier(8,),).toBe(-1,);
    expect(abilityModifier(6,),).toBe(-2,);
    expect(abilityModifier(1,),).toBe(-5,);
    expect(abilityModifier(20,),).toBe(5,);
  });
  it("computeModifiers derives all six ability scores", () => {
    const stats = { str: 16, dex: 14, con: 15, int: 13, wis: 12, cha: 8, };
    const result = computeModifiers(stats,);
    expect(result.strMod,).toBe(3,);
    expect(result.dexMod,).toBe(2,);
    expect(result.conMod,).toBe(2,);
    expect(result.intMod,).toBe(1,);
    expect(result.wisMod,).toBe(1,);
    expect(result.chaMod,).toBe(-1,);
    expect(result.str,).toBe(16,);
    expect(result.dex,).toBe(14,);
  });
});
