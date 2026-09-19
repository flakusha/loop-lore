// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Body-systems enum tests — Species consolidation must stay a unique,
 * canonical value set that preserves the "human" sentinel existing
 * consumers (heat cycles) default to.
 */
import { describe, expect, test, } from "bun:test";
import { Species, } from "./enums";
import type { ReproductionCapability, } from "./enums";

describe("Species", () => {
  test("values are unique and snake_case", () => {
    const values = Object.values(Species,);
    expect(new Set(values,).size,).toBe(values.length,);
    for (const value of values) {
      expect(value,).toMatch(/^[a-z_]+$/,);
    }
  });

  test("preserves the canonical baseline set", () => {
    expect(Object.values(Species,),).toEqual([
      "human",
      "elf",
      "dwarf",
      "orc",
      "demon",
      "angel",
      "beast",
      "dragon",
    ],);
    // Sentinel consumed by heat-cycle defaults must not move.
    expect(Species.Human,).toBe("human",);
  });

  test("ReproductionCapability flags are all booleans on a sample", () => {
    const capability: ReproductionCapability = {
      canReproduce: true,
      requiresHeat: false,
      crossFertile: true,
    };
    for (const flag of Object.values(capability,)) {
      expect(typeof flag,).toBe("boolean",);
    }
  });
});
