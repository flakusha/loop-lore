// Focused battle coverage
import { describe, expect, it, } from "bun:test";
import {
  applyMoraleModifier,
  computeMoraleLevel,
  createMoraleState,
  createStatusEffect,
  rollDice,
  tickStatusEffect,
} from "./integration-schemas";

describe("battle coverage", () => {
  it("morale levels", () => {
    expect(computeMoraleLevel(10,),).toBe("broken",);
    expect(computeMoraleLevel(30,),).toBe("shaken",);
    expect(computeMoraleLevel(50,),).toBe("steady",);
    expect(computeMoraleLevel(70,),).toBe("confident",);
    expect(computeMoraleLevel(90,),).toBe("inspired",);
  });
  it("morale state", () => {
    const s = createMoraleState("c1", 55,);
    expect(s.level,).toBe("steady",);
    applyMoraleModifier(s, { reason: "test", value: -15, duration: 2, appliedAt: new Date().toISOString(), },);
  });
  it("status effect tick", () => {
    const e = createStatusEffect("poison", "debuff", "str", -2, 3,);
    expect(tickStatusEffect(e,)?.remainingTurns,).toBe(2,);
  });
  it("rollDice returns number total", () => {
    const r = rollDice("d20", 1, [],);
    expect(typeof r.total,).toBe("number",);
    expect(Array.isArray(r.results,),).toBe(true,);
  });
});
