/**
 * Battle Resolution Checks Tests
 *
 * Pins DC math and outcome invariants (rolls themselves are random).
 */
import { describe, expect, it, } from "bun:test";
import {
  makeCombatSkillCheck,
  makeConcentrationCheck,
  makeDeathSavingThrow,
  makeSavingThrow,
} from "./resolution-integration/checks.js";

const DC10 = { name: "easy", value: 10, description: "d", };

describe("makeSavingThrow", () => {
  it("keeps margin consistent with total and DC", () => {
    const res = makeSavingThrow(3, DC10,);
    expect(res.margin,).toBe(res.roll.total - 10,);
    const expected = res.roll.criticalSuccess || (!res.roll.criticalFailure && res.margin >= 0);
    expect(res.success,).toBe(expected,);
    expect(res.narration,).toInclude(`${res.roll.total} vs DC 10`,);
  });
});

describe("makeCombatSkillCheck", () => {
  it("mirrors crit flags and margin", () => {
    const res = makeCombatSkillCheck(5, DC10,);
    expect(res.criticalSuccess,).toBe(res.roll.criticalSuccess,);
    expect(res.criticalFailure,).toBe(res.roll.criticalFailure,);
    expect(res.margin,).toBe(res.roll.total - 10,);
  });
});

describe("makeConcentrationCheck", () => {
  it("uses half damage as DC when higher", () => {
    const res = makeConcentrationCheck(2, 30, DC10,);
    expect(res.narration,).toInclude("vs DC 15",);
  });
  it("keeps the base DC for small damage", () => {
    const res = makeConcentrationCheck(2, 4, DC10,);
    expect(res.narration,).toInclude("vs DC 10",);
  });
});

describe("makeDeathSavingThrow", () => {
  it("returns a well-formed outcome", () => {
    const res = makeDeathSavingThrow();
    expect(typeof res.success,).toBe("boolean",);
    expect(res.narration.length,).toBeGreaterThan(0,);
  });
});
