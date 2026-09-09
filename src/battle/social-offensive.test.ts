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

  // ── Edge cases ──────────────────────────────────────────────

  it("negative attacker intimidation produces a negative margin", () => {
    const res = calculateIntimidationEffect(1, -100, 1, morale(0,),);
    expect(res.success,).toBe(false,);
    expect(res.margin,).toBeLessThan(0,);
    expect(res.moraleEffect,).toBe(0,);
  });

  it("zero attacker intimidation with zero morale target resolves with margin 0 (failure)", () => {
    // attackerBonus = 0 + 1*2 = 2; targetResistance = 50 + 0*0.5 = 50.
    // margin = -48, success=false.
    const res = calculateIntimidationEffect(1, 0, 1, morale(0,),);
    expect(res.success,).toBe(false,);
    expect(res.moraleEffect,).toBe(0,);
  });

  it("high morale target boosts resistance (harder to intimidate)", () => {
    // targetResistance = 50 + 80*0.5 = 90. attackerBonus = 50 + 1*2 = 52.
    // margin = -38, failure.
    const res = calculateIntimidationEffect(1, 50, 1, morale(80,),);
    expect(res.success,).toBe(false,);
    expect(res.margin,).toBe(-38,);
  });

  it("target morale of exactly 100 (max) yields maximum resistance", () => {
    // resistance = 50 + 50 = 100; attackerBonus = 50 + 2 = 52; margin = -48.
    const res = calculateIntimidationEffect(1, 50, 1, morale(100,),);
    expect(res.margin,).toBe(-48,);
    expect(res.success,).toBe(false,);
  });

  it("NaN attacker level does not throw and yields a NaN margin", () => {
    const res = calculateIntimidationEffect(NaN, 50, 1, morale(0,),);
    // NaN propagates through the math.
    expect(Number.isNaN(res.margin,),).toBe(true,);
    expect(res.success,).toBe(false,);
  });

  it("attackerLevel = 0 makes the bonus a flat attackerIntimidation", () => {
    const res = calculateIntimidationEffect(0, 60, 1, morale(0,),);
    // attackerBonus = 60 + 0 = 60; resistance = 50; margin = 10.
    expect(res.margin,).toBe(10,);
    expect(res.success,).toBe(true,);
  });

  it("on success, the new targetMorale reflects a morale drop", () => {
    const before = morale(50,);
    const res = calculateIntimidationEffect(10, 100, 5, before,);
    expect(res.success,).toBe(true,);
    // Morale must have moved downward by the (capped) drop.
    expect(res.targetMorale.value,).toBeLessThan(before.value,);
    // Reason should mention "intimidated".
    expect(res.targetMorale.modifiers.some((m,) => m.reason === "intimidated"),).toBe(true,);
  });

  it("attackerLevel is unused — different levels with same other inputs yield same margin", () => {
    const a = calculateIntimidationEffect(10, 50, 1, morale(0,),);
    const b = calculateIntimidationEffect(10, 50, 99, morale(0,),);
    expect(a.margin,).toBe(b.margin,);
    expect(a.success,).toBe(b.success,);
  });
});
