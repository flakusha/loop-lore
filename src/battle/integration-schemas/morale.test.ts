// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { applyMoraleModifier, computeMoraleLevel, createMoraleState, } from "./morale.ts";

describe("morale integration", () => {
  test("createMoraleState creates valid state", () => {
    const state = createMoraleState("char1",);
    expect(state.characterId,).toBe("char1",);
    expect(state.value,).toBe(50,);
    expect(state.level,).toBe("steady",);
    expect(state.modifiers,).toEqual([],);
  });

  test("computeMoraleLevel returns correct levels", () => {
    expect(computeMoraleLevel(0,),).toBe("broken",);
    expect(computeMoraleLevel(20,),).toBe("broken",);
    expect(computeMoraleLevel(30,),).toBe("shaken",);
    expect(computeMoraleLevel(50,),).toBe("steady",);
    expect(computeMoraleLevel(75,),).toBe("confident",);
    expect(computeMoraleLevel(100,),).toBe("inspired",);
  });

  test("applyMoraleModifier increases value", () => {
    const state: any = {
      characterId: "char1",
      value: 50,
      level: "steady",
      modifiers: [],
      lastUpdated: new Date().toISOString(),
    };
    const modifier: any = { value: 20, name: "heal", duration: 0, appliedAt: new Date().toISOString(), };
    const result = applyMoraleModifier(state, modifier,);
    expect(result.value,).toBe(70,);
    expect(result.modifiers,).toHaveLength(1,);
  });
});
