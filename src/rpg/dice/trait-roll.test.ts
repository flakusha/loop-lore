// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { defaultStatBlock, } from "../stats/validation.js";
import { assertTraitIds, } from "../traits/catalog.js";
import { applyTraits, minimumRollValue, rollWithTraits, } from "./trait-roll.js";

describe("minimumRollValue", () => {
  it("takes the higher floor for the same context (stack rule)", () => {
    const traits = assertTraitIds(["keen_observer",],);
    expect(minimumRollValue("check", traits,),).toBe(5,);
    expect(minimumRollValue("attack", traits,),).toBe(1,);
  });
});

describe("applyTraits", () => {
  it("composes ability bonus, skill bonus, and floor", () => {
    const stats = { ...defaultStatBlock(), cha: 14, };
    const resolved = applyTraits(stats, assertTraitIds(["silver_tongue", "keen_observer",],), {
      kind: "check",
      skill: "persuasion",
    },);

    // persuasion -> cha 14 -> +2 base, +2 silver_tongue
    expect(resolved.abilityMod,).toBe(2,);
    expect(resolved.skillMod,).toBe(2,);
    expect(resolved.rollFloor,).toBe(5,);
    expect(resolved.sourceTraits,).toContain("silver_tongue",);
  });

  it("flags save proficiency only for matching save", () => {
    const save = applyTraits(defaultStatBlock(), assertTraitIds(["iron_will",],), { kind: "save", ability: "wis", },);
    expect(save.proficiencyApplied,).toBe(true,);
    const check = applyTraits(defaultStatBlock(), assertTraitIds(["iron_will",],), {
      kind: "check",
      ability: "wis",
    },);

    expect(check.proficiencyApplied,).toBe(false,);
  });
});

describe("rollWithTraits", () => {
  it("floor never drops the roll below the minimum", () => {
    const stats = defaultStatBlock();
    for (let i = 0; i < 50; i++) {
      const { roll, resolved, } = rollWithTraits(stats, assertTraitIds(["keen_observer",],), { kind: "check", },);
      expect(roll.dice[0]!.value,).toBeGreaterThanOrEqual(resolved.rollFloor,);
    }
  });
});
