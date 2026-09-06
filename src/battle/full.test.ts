// Full battle schemas
import { describe, expect, it, } from "bun:test";
import {
  getCombatTerrainModifiers,
  getCombatWeatherModifiers,
  rollDice,
} from "../battle/integration-schemas";
describe("battle full", () => {
  it("weather modifiers", () => {
    const w = getCombatWeatherModifiers("rain",);
    expect(typeof w,).toBe("object",);
  });
  it("terrain modifiers", () => {
    const t = getCombatTerrainModifiers("forest",);
    expect(typeof t,).toBe("object",);
  });
  it("rollDice d6", () => {
    const r = rollDice("d6", 2, [],);
    expect(r.results.length,).toBe(2,);
  });
});
