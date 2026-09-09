import { describe, expect, it, } from "bun:test";
import { rollDie, } from "./roll";

describe("rpg/dice/roll (0% → real logic test)", () => {
  it("rollDie(6) returns value between 1 and 6 inclusive", () => {
    for (let i = 0; i < 20; i++) {
      const result = rollDie(6,);
      expect(result,).toBeGreaterThanOrEqual(1,);
      expect(result,).toBeLessThanOrEqual(6,);
    }
  });

  it("rollDie(20) returns value between 1 and 20 inclusive", () => {
    const result = rollDie(20,);
    expect(result,).toBeGreaterThanOrEqual(1,);
    expect(result,).toBeLessThanOrEqual(20,);
  });

  it("rollDie(100) returns value between 1 and 100 inclusive", () => {
    const r = rollDie(100,);
    expect(r,).toBeGreaterThanOrEqual(1,);
    expect(r,).toBeLessThanOrEqual(100,);
  });

  // ── Edge cases ──────────────────────────────────────────────

  it("rollDie with negative sides always returns 1 (Uint32 % -1 === 0)", () => {
    // cryptoRandomInt does `Uint32 % sides`; % -1 in JS yields 0.
    // The +1 offset therefore always returns 1.
    for (let i = 0; i < 5; i++) {
      const r = rollDie(-1 as unknown as 4,);
      expect(r,).toBe(1,);
    }
  });

  it("rollDie(0) returns NaN because Uint32 % 0 === NaN, +1 === NaN", () => {
    // Pin the broken behavior so a future guard surfaces as a diff.
    const r = rollDie(0 as unknown as 4,);
    expect(Number.isNaN(r,),).toBe(true,);
  });

  it("rollDie with string sides coerces via Number (Number('6') === 6)", () => {
    const r = rollDie("6" as unknown as 4,);
    expect(r,).toBeGreaterThanOrEqual(1,);
    expect(r,).toBeLessThanOrEqual(6,);
  });

  it("rollDie with NaN sides returns NaN", () => {
    const r = rollDie(NaN as unknown as 4,);
    expect(Number.isNaN(r,),).toBe(true,);
  });

  it("rollDie with Infinity sides returns a value in [1, Infinity) modulo bias", () => {
    // cryptoRandomInt does Uint32 % Infinity; Infinity coerces Uint32
    // values to themselves, so the result is `(Uint32 + 1)`, bounded
    // by 2^32.
    for (let i = 0; i < 5; i++) {
      const r = rollDie(Infinity as unknown as 4,);
      expect(r,).toBeGreaterThanOrEqual(1,);
      expect(Number.isFinite(r,),).toBe(true,);
    }
  });
});
