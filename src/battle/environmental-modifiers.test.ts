/**
 * Battle Environmental Modifier Tests
 *
 * Pins cover defense, difficult-terrain speed, and stat clamps.
 */
import { describe, expect, it, } from "bun:test";
import { type CombatStats, } from "./integration-schemas/stats.js";
import {
  applyEnvironmentalModifiers,
  getEnvironmentalModifiers,
} from "./weather-integration/modifiers.js";
import { type BattleTerrain, } from "./weather-integration/types.js";

const PLAIN: BattleTerrain = {
  type: "open",
  weather: "clear",
  cover: "none",
  elevation: "low",
  difficultTerrain: false,
  hazards: [],
};

const STATS: CombatStats = {
  characterId: "c1",
  health: 40,
  maxHealth: 50,
  mana: 20,
  maxMana: 20,
  stamina: 10,
  maxStamina: 10,
  attack: 12,
  defense: 10,
  magicAttack: 8,
  magicDefense: 8,
  speed: 30,
  criticalChance: 5,
  dodgeChance: 5,
  accuracy: 80,
};

describe("getEnvironmentalModifiers", () => {
  it("adds cover defense for three-quarters cover", () => {
    const mods = getEnvironmentalModifiers({ ...PLAIN, cover: "three_quarters", },);
    const cover = mods.find((m,) => m.id === "cover_defense");
    expect(cover?.value,).toBe(5,);
  });
  it("adds no cover modifier in the open", () => {
    const mods = getEnvironmentalModifiers(PLAIN,);
    expect(mods.some((m,) => m.id === "cover_defense"),).toBe(false,);
  });
  it("penalizes speed on difficult terrain", () => {
    const mods = getEnvironmentalModifiers({ ...PLAIN, difficultTerrain: true, },);
    const slow = mods.find((m,) => m.id === "difficult_terrain_speed");
    expect(slow?.value,).toBe(-10,);
  });
});

describe("applyEnvironmentalModifiers", () => {
  it("sums flat modifiers into stats", () => {
    const out = applyEnvironmentalModifiers(STATS, getEnvironmentalModifiers({ ...PLAIN, difficultTerrain: true, },),);
    expect(out.speed,).toBe(20,);
  });
  it("clamps health and chances into range", () => {
    const out = applyEnvironmentalModifiers(
      { ...STATS, health: 49, accuracy: 150, },
      [{
        id: "x",
        source: "terrain",
        affectedStat: "health",
        value: 100,
        isPercentage: false,
        duration: 0,
        description: "x",
      },],
    );
    expect(out.health,).toBe(50,);
    expect(out.accuracy,).toBe(100,);
  });
});
