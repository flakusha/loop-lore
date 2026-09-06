// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { describe, expect, test, } from "bun:test";
import {
  getCombatTerrainModifiers,
  type TerrainType,
} from "./terrain";

describe("getCombatTerrainModifiers", () => {
  test("forest returns dodge and accuracy modifiers", () => {
    const modifiers = getCombatTerrainModifiers("forest",);
    expect(modifiers).toHaveLength(2);
    expect(modifiers.map(m => m.id)).toContain("forest_dodge",);
    expect(modifiers.map(m => m.id)).toContain("forest_ranged",);
    expect(modifiers.every(m => m.source === "terrain",)).toBe(true);
  });

  test("forest dodge modifier has correct values", () => {
    const modifiers = getCombatTerrainModifiers("forest",);
    const dodge = modifiers.find(m => m.id === "forest_dodge",);
    expect(dodge).toBeDefined();
    expect(dodge!.affectedStat).toBe("dodgeChance",);
    expect(dodge!.value).toBe(15,);
    expect(dodge!.isPercentage).toBe(false);
    expect(dodge!.duration).toBe(0,);
    expect(dodge!.description).toBe("Trees provide cover",);
  });

  test("forest ranged modifier has correct values", () => {
    const modifiers = getCombatTerrainModifiers("forest",);
    const ranged = modifiers.find(m => m.id === "forest_ranged",);
    expect(ranged).toBeDefined();
    expect(ranged!.affectedStat).toBe("accuracy",);
    expect(ranged!.value).toBe(-10,);
    expect(ranged!.isPercentage).toBe(false);
    expect(ranged!.duration).toBe(0,);
    expect(ranged!.description).toBe("Trees obstruct ranged attacks",);
  });

  test("mountain returns defense and speed modifiers", () => {
    const modifiers = getCombatTerrainModifiers("mountain",);
    expect(modifiers).toHaveLength(2);
    expect(modifiers.map(m => m.id)).toContain("mountain_defense",);
    expect(modifiers.map(m => m.id)).toContain("mountain_speed",);
  });

  test("mountain defense modifier has correct values", () => {
    const modifiers = getCombatTerrainModifiers("mountain",);
    const defense = modifiers.find(m => m.id === "mountain_defense",);
    expect(defense).toBeDefined();
    expect(defense!.affectedStat).toBe("defense",);
    expect(defense!.value).toBe(10,);
    expect(defense!.isPercentage).toBe(false);
    expect(defense!.duration).toBe(0,);
    expect(defense!.description).toBe("High ground advantage",);
  });

  test("mountain speed modifier has correct values", () => {
    const modifiers = getCombatTerrainModifiers("mountain",);
    const speed = modifiers.find(m => m.id === "mountain_speed",);
    expect(speed).toBeDefined();
    expect(speed!.affectedStat).toBe("speed",);
    expect(speed!.value).toBe(-10,);
    expect(speed!.isPercentage).toBe(false);
    expect(speed!.duration).toBe(0,);
    expect(speed!.description).toBe("Difficult terrain",);
  });

  test("open returns no modifiers", () => {
    const modifiers = getCombatTerrainModifiers("open",);
    expect(modifiers).toHaveLength(0);
  });

  test("desert returns no modifiers", () => {
    const modifiers = getCombatTerrainModifiers("desert",);
    expect(modifiers).toHaveLength(0);
  });

  test("urban returns no modifiers", () => {
    const modifiers = getCombatTerrainModifiers("urban",);
    expect(modifiers).toHaveLength(0);
  });

  test("dungeon returns no modifiers", () => {
    const modifiers = getCombatTerrainModifiers("dungeon",);
    expect(modifiers).toHaveLength(0);
  });

  test("swamp returns speed and dodge modifiers", () => {
    const modifiers = getCombatTerrainModifiers("swamp",);
    expect(modifiers).toHaveLength(2);
    expect(modifiers.map(m => m.id)).toContain("swamp_speed",);
    expect(modifiers.map(m => m.id)).toContain("swamp_dodge",);
  });

  test("swamp speed modifier has correct values", () => {
    const modifiers = getCombatTerrainModifiers("swamp",);
    const speed = modifiers.find(m => m.id === "swamp_speed",);
    expect(speed).toBeDefined();
    expect(speed!.affectedStat).toBe("speed",);
    expect(speed!.value).toBe(-20,);
    expect(speed!.isPercentage).toBe(false);
    expect(speed!.duration).toBe(0,);
    expect(speed!.description).toBe("Boggy terrain slows movement",);
  });

  test("swamp dodge modifier has correct values", () => {
    const modifiers = getCombatTerrainModifiers("swamp",);
    const dodge = modifiers.find(m => m.id === "swamp_dodge",);
    expect(dodge).toBeDefined();
    expect(dodge!.affectedStat).toBe("dodgeChance",);
    expect(dodge!.value).toBe(-10,);
    expect(dodge!.isPercentage).toBe(false);
    expect(dodge!.duration).toBe(0,);
    expect(dodge!.description).toBe("Limited maneuverability",);
  });

  test("underwater returns speed and magic modifiers", () => {
    const modifiers = getCombatTerrainModifiers("underwater",);
    expect(modifiers).toHaveLength(2);
    expect(modifiers.map(m => m.id)).toContain("water_speed",);
    expect(modifiers.map(m => m.id)).toContain("water_magic",);
  });

  test("underwater speed modifier has correct values", () => {
    const modifiers = getCombatTerrainModifiers("underwater",);
    const speed = modifiers.find(m => m.id === "water_speed",);
    expect(speed).toBeDefined();
    expect(speed!.affectedStat).toBe("speed",);
    expect(speed!.value).toBe(-30,);
    expect(speed!.isPercentage).toBe(false);
    expect(speed!.duration).toBe(0,);
    expect(speed!.description).toBe("Water resistance",);
  });

  test("underwater magic modifier has correct values", () => {
    const modifiers = getCombatTerrainModifiers("underwater",);
    const magic = modifiers.find(m => m.id === "water_magic",);
    expect(magic).toBeDefined();
    expect(magic!.affectedStat).toBe("magicAttack",);
    expect(magic!.value).toBe(20,);
    expect(magic!.isPercentage).toBe(true);
    expect(magic!.duration).toBe(0,);
    expect(magic!.description).toBe("Water amplifies ice/water magic",);
  });
});

describe("TerrainType", () => {
  test("includes all terrain types", () => {
    const types: TerrainType[] = [
      "open",
      "forest",
      "mountain",
      "swamp",
      "desert",
      "urban",
      "dungeon",
      "underwater",
    ];
    for (const type of types) {
      // Just verify each is a valid type - TypeScript ensures this at compile time
      expect(typeof type).toBe("string");
    }
  });
});