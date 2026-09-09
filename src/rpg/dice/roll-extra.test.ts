import { describe, expect, it, } from "bun:test";
import { rollDie, } from "../dice/roll";

describe("rpg/dice/roll (real logic - 3 assertions)", () => {
  it("rollDie(6) in range 1-6", () => {
    const r = rollDie(6,);
    expect(r >= 1 && r <= 6,).toBe(true,);
  });

  it("rollDie(20) returns integer in [1, 20]", () => {
    const r = rollDie(20,);
    expect(Number.isInteger(r,),).toBe(true,);
    expect(r >= 1,).toBe(true,);
    expect(r <= 20,).toBe(true,);
  });

  it("rollDie(100) in range 1-100", () => {
    const r = rollDie(100,);
    expect(r >= 1 && r <= 100,).toBe(true,);
  });

  // ── Edge cases ──────────────────────────────────────────────

  it("rollDie(2) can return both 1 and 2 across many iterations (coverage of the d2 boundary)", () => {
    // d2 is the smallest meaningful die; across many rolls, both 1
    // and 2 must surface (assuming uniform distribution).
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      seen.add(rollDie(2 as unknown as 4,),);
    }
    expect(seen.has(1,),).toBe(true,);
    expect(seen.has(2,),).toBe(true,);
  });

  it("rollDie(3) is in [1, 3] and never exceeds 3", () => {
    for (let i = 0; i < 50; i++) {
      const r = rollDie(3 as unknown as 4,);
      expect(r >= 1,).toBe(true,);
      expect(r <= 3,).toBe(true,);
    }
  });

  it("rollDie with negative sides always returns 1 (Uint32 % -1 === 0)", () => {
    for (let i = 0; i < 5; i++) {
      const r = rollDie(-1 as unknown as 4,);
      expect(r,).toBe(1,);
    }
  });

  it("rollDie(0) returns NaN", () => {
    expect(Number.isNaN(rollDie(0 as unknown as 4,),),).toBe(true,);
  });

  it("rollDie with NaN sides returns NaN", () => {
    expect(Number.isNaN(rollDie(NaN as unknown as 4,),),).toBe(true,);
  });

  it("rollDie with Infinity sides returns a finite positive integer bounded by 2^32", () => {
    const r = rollDie(Infinity as unknown as 4,);
    expect(Number.isInteger(r,),).toBe(true,);
    expect(r >= 1,).toBe(true,);
    expect(r <= 2 ** 32,).toBe(true,);
  });
});
