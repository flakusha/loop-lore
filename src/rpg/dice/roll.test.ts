import { describe, expect, it, } from "bun:test";
import { rollDie, } from "./roll";

describe("rpg/dice/roll (0% -> real logic test)", () => {
  it("rollDie(6) returns value between 1 and 6 inclusive", () => {
    for (let i = 0; i < 20; i++) {
      const result = rollDie(6,);
      expect(result,).toBeGreaterThanOrEqual(1,);
      expect(result,).toBeLessThanOrEqual(6,);
      expect(Number.isInteger(result,),).toBe(true,);
    }
  });
  it("rollDie(20) returns value between 1 and 20", () => {
    const result = rollDie(20,);
    expect(result,).toBeGreaterThanOrEqual(1,);
    expect(result,).toBeLessThanOrEqual(20,);
  });
  it("rollDie(100) returns value in [1, 100]", () => {
    const r = rollDie(100,);
    expect(r,).toBeGreaterThanOrEqual(1,);
    expect(r,).toBeLessThanOrEqual(100,);
  });
});
