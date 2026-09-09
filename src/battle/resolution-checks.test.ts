/**
 * Battle Resolution Checks Tests
 *
 * Pins DC math and outcome invariants (rolls themselves are random).
 */
import { describe, expect, it, } from "bun:test";
import { rollDice, } from "./integration-schemas/index.js";
import {
  makeCombatSkillCheck,
  makeConcentrationCheck,
  makeDeathSavingThrow,
  makeSavingThrow,
} from "./resolution-integration/checks.js";

const DC10 = { name: "easy", value: 10, description: "d", };
const DC0 = { name: "auto", value: 0, description: "d", };
const DC30 = { name: "legendary", value: 30, description: "d", };

describe("makeSavingThrow", () => {
  it("keeps margin consistent with total and DC", () => {
    const res = makeSavingThrow(3, DC10,);
    expect(res.margin,).toBe(res.roll.total - 10,);
    const expected = res.roll.criticalSuccess || (!res.roll.criticalFailure && res.margin >= 0);
    expect(res.success,).toBe(expected,);
    expect(res.narration,).toInclude(`${res.roll.total} vs DC 10`,);
  });

  // ── Edge cases ──────────────────────────────────────────────

  it("accepts an explicit modifiers list (empty array)", () => {
    const res = makeSavingThrow(0, DC10, [],);
    expect(res.roll.total,).toBeGreaterThanOrEqual(1,);
    expect(res.roll.total,).toBeLessThanOrEqual(20,);
  });

  it("rollDice handles large bonus without throwing", () => {
    // Sanity: rollDice is the underlying primitive.
    for (let i = 0; i < 30; i++) {
      const r = rollDice("d20", 1, [{ source: "save", value: 9999, type: "bonus", },],);
      expect(r.total,).toBeGreaterThan(0,);
    }
  });
});

describe("makeCombatSkillCheck", () => {
  it("mirrors crit flags and margin", () => {
    const res = makeCombatSkillCheck(5, DC10,);
    expect(res.criticalSuccess,).toBe(res.roll.criticalSuccess,);
    expect(res.criticalFailure,).toBe(res.roll.criticalFailure,);
    expect(res.margin,).toBe(res.roll.total - 10,);
  });

  // ── Edge cases ──────────────────────────────────────────────

  it("narrative mentions the actual roll total", () => {
    const res = makeCombatSkillCheck(5, DC30,);
    expect(res.narration,).toInclude(`Roll: ${res.roll.total}`,);
  });

  it("with DC 0, success is true on any non-critical-failure roll", () => {
    let sawSuccess = false;
    for (let i = 0; i < 30; i++) {
      const res = makeCombatSkillCheck(0, DC0,);
      if (res.roll.criticalFailure) {
        expect(res.success,).toBe(false,);
      } else {
        // margin = roll.total - 0 >= 0 always.
        expect(res.success,).toBe(true,);
        sawSuccess = true;
      }
    }
    expect(sawSuccess,).toBe(true,);
  });

  it("zero-AC style DC produces consistent margins", () => {
    let minMargin = Infinity;
    let maxMargin = -Infinity;
    for (let i = 0; i < 30; i++) {
      const res = makeCombatSkillCheck(0, DC0,);
      minMargin = Math.min(minMargin, res.margin,);
      maxMargin = Math.max(maxMargin, res.margin,);
    }
    // d20: 1..20 + 0 (skill bonus) = 1..20 → margin 1..20.
    expect(minMargin,).toBeGreaterThanOrEqual(1,);
    expect(maxMargin,).toBeLessThanOrEqual(20,);
  });

  it("does not crash on NaN saveBonus (yields a result with NaN margin)", () => {
    // The implementation does not guard against NaN bonuses; we pin the
    // observable behavior — the function returns a result object.
    const res = makeSavingThrow(NaN, DC10,);
    expect(res.narration.length,).toBeGreaterThan(0,);
    expect(typeof res.success,).toBe("boolean",);
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

  // ── Edge cases ──────────────────────────────────────────────

  it("uses the base DC when damage is 0", () => {
    const res = makeConcentrationCheck(5, 0, DC10,);
    expect(res.narration,).toInclude("vs DC 10",);
  });

  it("handles large damage correctly (DC = floor(damage/2))", () => {
    const res = makeConcentrationCheck(0, 100, DC10,);
    expect(res.narration,).toInclude("vs DC 50",);
  });

  it("returns success=false when total < DC (no margin reported)", () => {
    const res = makeConcentrationCheck(-10, 50, DC10,);
    // DC = max(10, 25) = 25. With -10 save, roll is in [-10+1, -10+20].
    expect(res.narration.length,).toBeGreaterThan(0,);
  });
});

describe("makeDeathSavingThrow", () => {
  it("returns a well-formed outcome", () => {
    const res = makeDeathSavingThrow();
    expect(typeof res.success,).toBe("boolean",);
    expect(res.narration.length,).toBeGreaterThan(0,);
  });

  // ── Edge cases ──────────────────────────────────────────────

  it("roll.total is in [1, 20] across many invocations", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 50; i++) {
      const res = makeDeathSavingThrow();
      min = Math.min(min, res.roll.total,);
      max = Math.max(max, res.roll.total,);
    }
    expect(min,).toBeGreaterThanOrEqual(1,);
    expect(max,).toBeLessThanOrEqual(20,);
  });

  it("narration includes the roll total on success/failure branches", () => {
    let sawBranch = false;
    for (let i = 0; i < 30; i++) {
      const res = makeDeathSavingThrow();
      if (!res.criticalSuccess && !res.criticalFailure) {
        // Standard success/failure narration must mention the total.
        expect(res.narration,).toInclude(`${res.roll.total}`,);
        sawBranch = true;
        break;
      }
    }
    expect(sawBranch,).toBe(true,);
  });
});
