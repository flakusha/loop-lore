// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { getCombatTerrainModifiers, type TerrainType, } from "./terrain";

describe("battle integration terrain", () => {
  test("terrain types exist", () => {
    const terrains: TerrainType[] = [
      "open",
      "forest",
      "mountain",
      "swamp",
      "desert",
      "urban",
      "dungeon",
      "underwater",
    ];
    expect(terrains.length,).toBe(8,);
    for (const terrain of terrains) {
      expect(Array.isArray(getCombatTerrainModifiers(terrain,)),).toBe(true,);
    }
  });
});
