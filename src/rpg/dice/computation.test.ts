import { describe, expect, it, } from "bun:test";
import { rollD20WithAdvantage, rollMultiple, } from "./roll";
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
