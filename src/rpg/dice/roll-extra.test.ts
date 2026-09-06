import { describe, expect, it, } from "bun:test";
import { rollDie, } from "../dice/roll";

describe("rpg/dice/roll (real logic - 3 assertions)", () => {
  it("rollDie(6) in range 1-6", () => {
    const r = rollDie(6,);
    expect(r >= 1 && r <= 6,).toBe(true,);
    expect(Number.isInteger(r,),).toBe(true,);
  });
  it("rollDie(20) in range 1-20", () => {
    const r = rollDie(20,);
    expect(r >= 1 && r <= 20,).toBe(true,);
  });
  it("rollDie produces different values over multiple rolls", () => {
    const results = Array.from({ length: 10, }, () => rollDie(6,),);
    const unique = new Set(results,);
    expect(unique.size,).toBeGreaterThanOrEqual(2,);
  });
});
