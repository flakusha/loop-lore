/**
 * Battle Social-Offensive Tests
 *
 * Pins intimidation margins and morale-drop caps.
 */
import { describe, expect, it, } from "bun:test";
import { type MoraleState, } from "./integration-schemas/morale.js";
import { calculateIntimidationEffect, } from "./social-integration/offensive.js";

function morale(value: number,): MoraleState {
  return { characterId: "c1", value, level: "steady", modifiers: [], lastUpdated: "t", };
}

describe("calculateIntimidationEffect", () => {
  it("succeeds on positive margin with capped morale drop", () => {
    const res = calculateIntimidationEffect(10, 50, 1, morale(0,),);
    expect(res.success,).toBe(true,);
    expect(res.margin,).toBe(20,);
    expect(res.moraleEffect,).toBe(-10,);
  });
  it("caps the morale drop at 30", () => {
    const res = calculateIntimidationEffect(20, 100, 1, morale(0,),);
    expect(res.success,).toBe(true,);
    expect(res.moraleEffect,).toBe(-30,);
  });
  it("leaves morale untouched on failure", () => {
    const before = morale(100,);
    const res = calculateIntimidationEffect(1, 0, 1, before,);
    expect(res.success,).toBe(false,);
    expect(res.moraleEffect,).toBe(0,);
    expect(res.targetMorale,).toBe(before,);
  });
});
