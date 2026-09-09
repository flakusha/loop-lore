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

  // ── Edge cases ──────────────────────────────────────────────

  it("rollDice handles 0 count (no dice rolled)", () => {
    const r = rollDice("d6", 0, [],);
    expect(r.results.length,).toBe(0,);
    expect(r.total,).toBe(0,);
  });

  it("rollDice handles large count (100 dice)", () => {
    const r = rollDice("d6", 100, [],);
    expect(r.results.length,).toBe(100,);
    for (const v of r.results) {
      expect(v >= 1 && v <= 6,).toBe(true,);
    }
  });

  it("rollDice accepts a negative modifier and reflects in total", () => {
    const r = rollDice("d20", 1, [{ source: "penalty", value: -1000, type: "penalty", },],);
    // total clamps to 0.
    expect(r.total,).toBeGreaterThanOrEqual(0,);
  });

  it("getCombatTerrainModifiers for 'underwater' returns two modifiers", () => {
    const t = getCombatTerrainModifiers("underwater",);
    expect(t.length,).toBe(2,);
    const ids = t.map((m,) => m.id);
    expect(ids,).toContain("water_speed",);
    expect(ids,).toContain("water_magic",);
  });

  it("getCombatTerrainModifiers for 'swamp' returns two modifiers", () => {
    const t = getCombatTerrainModifiers("swamp",);
    expect(t.length,).toBe(2,);
    const ids = t.map((m,) => m.id);
    expect(ids,).toContain("swamp_speed",);
    expect(ids,).toContain("swamp_dodge",);
  });

  it("getCombatWeatherModifiers for 'cold_snap' returns two modifiers", () => {
    const w = getCombatWeatherModifiers("cold_snap",);
    expect(w.length,).toBe(2,);
    const ids = w.map((m,) => m.id);
    expect(ids,).toContain("cold_speed",);
    expect(ids,).toContain("cold_attack",);
  });

  it("getCombatWeatherModifiers for 'clear' returns no modifiers", () => {
    const w = getCombatWeatherModifiers("clear",);
    expect(w,).toEqual([],);
  });
});
