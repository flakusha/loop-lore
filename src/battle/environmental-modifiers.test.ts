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

  // ── Edge cases ──────────────────────────────────────────────

  it("returns no modifiers when weather and cover are both neutral", () => {
    const mods = getEnvironmentalModifiers(PLAIN,);
    expect(mods,).toEqual([],);
  });

  it("combines full cover + difficult terrain + weather (storm) into 4 modifiers", () => {
    const mods = getEnvironmentalModifiers({
      ...PLAIN,
      cover: "full",
      difficultTerrain: true,
      weather: "storm",
    },);
    const ids = mods.map((m,) => m.id);
    expect(ids,).toContain("cover_defense",);
    expect(ids,).toContain("difficult_terrain_speed",);
    expect(ids,).toContain("storm_accuracy",);
    expect(ids,).toContain("storm_speed",);
    expect(mods.length,).toBe(4,);
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

  // ── Edge cases ──────────────────────────────────────────────

  it("applies a zero modifier (no-op)", () => {
    const out = applyEnvironmentalModifiers(STATS, [{
      id: "x",
      source: "terrain",
      affectedStat: "speed",
      value: 0,
      isPercentage: false,
      duration: 0,
      description: "noop",
    },],);
    expect(out.speed,).toBe(30,);
  });

  it("applies a negative percentage modifier (50% speed reduction)", () => {
    const out = applyEnvironmentalModifiers(STATS, [{
      id: "slow",
      source: "hazard",
      affectedStat: "speed",
      value: -50,
      isPercentage: true,
      duration: 0,
      description: "halved",
    },],);
    expect(out.speed,).toBe(15,);
  });

  it("clamps health to 0 (never goes negative)", () => {
    const out = applyEnvironmentalModifiers(STATS, [{
      id: "x",
      source: "hazard",
      affectedStat: "health",
      value: -1000,
      isPercentage: false,
      duration: 0,
      description: "dmg",
    },],);
    expect(out.health,).toBe(0,);
  });

  it("clamps mana and stamina to their respective maxes", () => {
    const out = applyEnvironmentalModifiers(
      { ...STATS, mana: 5, stamina: 5, },
      [
        {
          id: "x1",
          source: "terrain",
          affectedStat: "mana",
          value: 100,
          isPercentage: false,
          duration: 0,
          description: "x",
        },
        {
          id: "x2",
          source: "terrain",
          affectedStat: "stamina",
          value: 100,
          isPercentage: false,
          duration: 0,
          description: "x",
        },
      ],
    );
    expect(out.mana,).toBe(20,);
    expect(out.stamina,).toBe(10,);
  });

  it("unknown weather value produces no weather modifiers", () => {
    // TypeBox would normally prevent this, but at runtime the source can
    // be asked for an unrecognized weather. The function should not throw.
    const mods = getEnvironmentalModifiers({
      ...PLAIN,
      // @ts-expect-error testing runtime behavior with invalid weather
      weather: "hurricane_typhoon",
    },);
    expect(mods,).toEqual([],);
  });
});
