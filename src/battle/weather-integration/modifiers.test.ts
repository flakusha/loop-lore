// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { CombatStats, EnvironmentalModifier, } from "../integration-schemas/stats.ts";
import { applyEnvironmentalModifiers, getEnvironmentalModifiers, } from "./modifiers.ts";
import type { BattleTerrain, } from "./types.ts";

function terrain(overrides: Partial<BattleTerrain> = {},): BattleTerrain {
  return {
    type: "open",
    weather: "clear",
    cover: "none",
    elevation: "medium",
    difficultTerrain: false,
    hazards: [],
    ...overrides,
  };
}

function stats(overrides: Partial<CombatStats> = {},): CombatStats {
  return {
    characterId: "c1",
    health: 80,
    maxHealth: 100,
    mana: 40,
    maxMana: 50,
    stamina: 60,
    maxStamina: 60,
    attack: 10,
    defense: 10,
    magicAttack: 100,
    magicDefense: 10,
    speed: 30,
    criticalChance: 10,
    dodgeChance: 10,
    accuracy: 80,
    ...overrides,
  };
}

describe("getEnvironmentalModifiers", () => {
  test("clear open ground with no cover yields no modifiers", () => {
    expect(getEnvironmentalModifiers(terrain(),),).toEqual([],);
  });

  test("rain plus forest combine weather and terrain modifiers", () => {
    const mods = getEnvironmentalModifiers(terrain({ weather: "rain", type: "forest", },),);
    const ids = mods.map((m,) => m.id);
    expect(ids,).toContain("rain_accuracy",);
    expect(ids,).toContain("rain_fire",);
    expect(ids,).toContain("forest_dodge",);
    expect(ids,).toContain("forest_ranged",);
  });

  test("half cover adds a +2 defense modifier", () => {
    const mods = getEnvironmentalModifiers(terrain({ cover: "half", },),);
    expect(mods,).toContainEqual({
      id: "cover_defense",
      source: "terrain",
      affectedStat: "defense",
      value: 2,
      isPercentage: false,
      duration: 0,
      description: "Cover provides +2 defense",
    },);
  });

  test("difficult terrain slows speed by 10", () => {
    const mods = getEnvironmentalModifiers(terrain({ difficultTerrain: true, },),);
    expect(mods,).toContainEqual({
      id: "difficult_terrain_speed",
      source: "terrain",
      affectedStat: "speed",
      value: -10,
      isPercentage: false,
      duration: 0,
      description: "Difficult terrain reduces speed",
    },);
  });
});

describe("applyEnvironmentalModifiers", () => {
  test("flat modifiers add to the stat", () => {
    const mod: EnvironmentalModifier = {
      id: "m1",
      source: "terrain",
      affectedStat: "defense",
      value: 5,
      isPercentage: false,
      duration: 0,
      description: "test",
    };
    expect(applyEnvironmentalModifiers(stats(), [mod,],).defense,).toBe(15,);
  });

  test("percentage modifiers scale and round", () => {
    const mod: EnvironmentalModifier = {
      id: "rain_fire",
      source: "weather",
      affectedStat: "magicAttack",
      value: -20,
      isPercentage: true,
      duration: 0,
      description: "test",
    };
    expect(applyEnvironmentalModifiers(stats(), [mod,],).magicAttack,).toBe(80,);
  });

  test("health clamps to maxHealth and accuracy clamps to 100", () => {
    const over: EnvironmentalModifier = {
      id: "heal",
      source: "terrain",
      affectedStat: "health",
      value: 500,
      isPercentage: false,
      duration: 0,
      description: "test",
    };
    const sharp: EnvironmentalModifier = {
      id: "aim",
      source: "weather",
      affectedStat: "accuracy",
      value: 500,
      isPercentage: false,
      duration: 0,
      description: "test",
    };
    const result = applyEnvironmentalModifiers(stats(), [over, sharp,],);
    expect(result.health,).toBe(100,);
    expect(result.accuracy,).toBe(100,);
  });

  test("dodge clamps at zero and unknown stats are skipped", () => {
    const drain: EnvironmentalModifier = {
      id: "drain",
      source: "weather",
      affectedStat: "dodgeChance",
      value: -500,
      isPercentage: false,
      duration: 0,
      description: "test",
    };
    const bogus: EnvironmentalModifier = {
      id: "bogus",
      source: "weather",
      affectedStat: "nonexistent",
      value: 50,
      isPercentage: false,
      duration: 0,
      description: "test",
    };
    const result = applyEnvironmentalModifiers(stats(), [drain, bogus,],);
    expect(result.dodgeChance,).toBe(0,);
    expect(result.attack,).toBe(10,);
  });

  test("end-to-end storm mountain terrain weakens the fighter", () => {
    const mods = getEnvironmentalModifiers(
      terrain({ weather: "storm", type: "mountain", cover: "full", difficultTerrain: true, },),
    );
    const result = applyEnvironmentalModifiers(stats(), mods,);
    expect(result.accuracy,).toBe(60,);
    expect(result.defense,).toBe(30,);
    // 30 base - 15 storm - 10 mountain - 10 difficult (speed is unclamped)
    expect(result.speed,).toBe(-5,);
  });
});
