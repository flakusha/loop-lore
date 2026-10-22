// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { assertTraitIds, getTraitsForWorld, TRAIT_CATALOG, } from "./catalog.js";

describe("TRAIT_CATALOG", () => {
  it("is frozen with at least 8 traits covering every effect kind", () => {
    expect(TRAIT_CATALOG.length,).toBeGreaterThanOrEqual(8,);
    expect(Object.isFrozen(TRAIT_CATALOG,),).toBe(true,);
    const kinds = new Set(TRAIT_CATALOG.flatMap((trait,) => trait.effects.map((effect,) => effect.kind)),);
    for (
      const kind of ["ability_bonus", "skill_bonus", "roll_floor", "save_proficiency", "hp_bonus_per_level",] as const
    ) {
      expect(kinds.has(kind,),).toBe(true,);
    }
  });
});

describe("getTraitsForWorld", () => {
  it("returns universal traits for any world", () => {
    const traits = getTraitsForWorld("any-world",);
    expect(traits.length,).toBeGreaterThan(0,);
    expect(traits.every((trait,) => trait.worldIdScope === "*" || trait.worldIdScope.includes("any-world",)),).toBe(
      true,
    );
  });

  it("includes scoped traits only for matching world", () => {
    const ids = new Set(getTraitsForWorld("shadowfell",).map((trait,) => trait.id),);
    expect(ids.has("shadow_step",),).toBe(true,);
    expect(getTraitsForWorld("elsewhere",).some((trait,) => trait.id === "shadow_step"),).toBe(false,);
  });
});

describe("assertTraitIds", () => {
  it("resolves known ids", () => {
    expect(assertTraitIds(["fast_reflexes", "iron_will",],).map((trait,) => trait.id),).toEqual([
      "fast_reflexes",
      "iron_will",
    ],);
  });

  it("throws on unknown id", () => {
    expect(() => assertTraitIds(["nope",],)).toThrow("Unknown trait id: nope",);
  });
});
