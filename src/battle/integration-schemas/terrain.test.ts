// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { getCombatTerrainModifiers, type TerrainType, } from "./terrain";

describe("battle integration terrain", () => {
  test("terrain types exist", () => {
    const terrain: TerrainType = "forest";
    expect(Array.isArray(getCombatTerrainModifiers(terrain,),),).toBe(true,);
  });
});
