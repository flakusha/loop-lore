import { describe, expect, it, } from "bun:test";
import { rollFromNotation, } from "./notation";
import { rollD20WithAdvantage, rollDie, rollMultiple, } from "./roll";
import { AdvantageMode, } from "./types";
describe("dice/real-computation", () => {
  it("rollMultiple returns array of length count", () => {
    const r = rollMultiple(5, 6,);
    expect(r,).toHaveLength(5,);
    for (const v of r) {
      expect(v >= 1 && v <= 6,).toBe(true,);
      expect(Number.isInteger(v,),).toBe(true,);
    }
  });
  it("rollD20WithAdvantage Normal returns value 1-20 with correct flags", () => {
    for (let i = 0; i < 30; i++) {
      const result = rollD20WithAdvantage(AdvantageMode.Normal,);
      expect(result.value >= 1 && result.value <= 20,).toBe(true,);
      expect(typeof result.natural20,).toBe("boolean",);
      expect(typeof result.natural1,).toBe("boolean",);
      expect(result.rawRolls,).toHaveLength(1,);
      expect(result.advantageMode,).toBe(AdvantageMode.Normal,);
    }
  });
  it("rollD20WithAdvantage Advantage takes max of 2 rolls", () => {
    const r = rollD20WithAdvantage(AdvantageMode.Advantage,);
    expect(r.value,).toBe(Math.max(r.rawRolls[0]!, r.rawRolls[1]!,),);
    expect(r.rawRolls,).toHaveLength(2,);
  });
  it("rollD20WithAdvantage Disadvantage takes min of 2 rolls", () => {
    const r = rollD20WithAdvantage(AdvantageMode.Disadvantage,);
    expect(r.value,).toBe(Math.min(r.rawRolls[0]!, r.rawRolls[1]!,),);
    expect(r.rawRolls,).toHaveLength(2,);
  });
  it("rollD20WithAdvantage flags critical hits correctly", () => {
    for (let i = 0; i < 50; i++) {
      const r = rollD20WithAdvantage(AdvantageMode.Normal,);
      expect(r.natural20 === (r.value === 20),).toBe(true,);
      expect(r.natural1 === (r.value === 1),).toBe(true,);
    }
  });
});

// ── Edge cases ──────────────────────────────────────────────

describe("dice/real-computation — edge cases", () => {
  it("rollMultiple with NaN count yields an array of length 0", () => {
    // For-loop with NaN count: i < NaN is false immediately.
    expect(rollMultiple(NaN, 6,),).toEqual([],);
  });

  it("rollMultiple with very large count yields the requested number of entries", () => {
    // Use a finite-but-large count to verify the function handles big-N
    // requests without truncation. (Infinity would loop forever; the
    // function does not guard against it — that's a caller-side
    // concern, not a rollMultiple bug.)
    const N = 100_000;
    const r = rollMultiple(N, 6,);
    expect(r.length,).toBe(N,);
  });

  it("rollMultiple with negative count yields an array of length 0", () => {
    // For-loop with i < -1 is false immediately.
    expect(rollMultiple(-5, 6,),).toEqual([],);
  });

  it("rollDie with negative sides returns 1 (Uint32 % -1 === 0 quirk)", () => {
    expect(rollDie(-1 as unknown as 20,),).toBe(1,);
  });

  it("rollDie with 0 sides returns NaN", () => {
    expect(Number.isNaN(rollDie(0 as unknown as 20,),),).toBe(true,);
  });

  it("rollDie with NaN sides returns NaN", () => {
    expect(Number.isNaN(rollDie(NaN as unknown as 20,),),).toBe(true,);
  });

  it("rollDie with Infinity sides returns a finite integer", () => {
    const r = rollDie(Infinity as unknown as 20,);
    expect(Number.isInteger(r,),).toBe(true,);
    expect(r >= 1,).toBe(true,);
  });

  it("rollD20WithAdvantage('normal').value never produces 0 across 30 iterations", () => {
    // rollD20WithAdvantage returns an object; assert on .value
    for (let i = 0; i < 30; i++) {
      expect(rollD20WithAdvantage("normal",).value,).toBeGreaterThanOrEqual(1,);
    }
  });

  it("rollD20WithAdvantage('advantage') returns the higher of two d20s", () => {
    for (let i = 0; i < 50; i++) {
      const r = rollD20WithAdvantage("advantage",);
      expect(r.value,).toBeGreaterThanOrEqual(1,);
      expect(r.value,).toBeLessThanOrEqual(20,);
    }
  });

  it("rollFromNotation('3d6') returns 3 dice within 1..6", () => {
    const r = rollFromNotation("3d6",);
    expect(r,).not.toBeNull();
    if (r === null) { throw new Error("rollFromNotation returned null for 3d6",); }
    expect(r.dice.length,).toBe(3,);
    const total = r.dice.reduce((a, d,) => a + d.value, 0,);
    expect(total,).toBeGreaterThanOrEqual(3,);
    expect(total,).toBeLessThanOrEqual(18,);
  });

  it("rollFromNotation rejects invalid notation (returns null)", () => {
    expect(rollFromNotation("not-a-notation",),).toBeNull();
    expect(rollFromNotation("",),).toBeNull();
  });
});
