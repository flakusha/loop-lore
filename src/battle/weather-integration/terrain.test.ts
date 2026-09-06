// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { createBattleTerrain, isTerrainAffectedByWeather, } from "./terrain.ts";

describe("createBattleTerrain", () => {
  test("defaults to open clear ground with no cover", () => {
    expect(createBattleTerrain(),).toEqual({
      type: "open",
      weather: "clear",
      cover: "none",
      elevation: "medium",
      difficultTerrain: false,
      hazards: [],
    },);
  });

  test("passes explicit type and weather through", () => {
    const terrain = createBattleTerrain("swamp", "rain",);
    expect(terrain.type,).toBe("swamp",);
    expect(terrain.weather,).toBe("rain",);
    expect(terrain.hazards,).toEqual([],);
  });
});

describe("isTerrainAffectedByWeather", () => {
  test("open and desert react to violent heat and cold only", () => {
    expect(isTerrainAffectedByWeather("open", "storm",),).toBe(true,);
    expect(isTerrainAffectedByWeather("open", "rain",),).toBe(false,);
    expect(isTerrainAffectedByWeather("desert", "heatwave",),).toBe(true,);
    expect(isTerrainAffectedByWeather("desert", "fog",),).toBe(false,);
  });

  test("forest reacts to storm and wind only", () => {
    expect(isTerrainAffectedByWeather("forest", "storm",),).toBe(true,);
    expect(isTerrainAffectedByWeather("forest", "wind",),).toBe(true,);
    expect(isTerrainAffectedByWeather("forest", "rain",),).toBe(false,);
  });

  test("mountain reacts to cold, wind, and snow", () => {
    expect(isTerrainAffectedByWeather("mountain", "cold_snap",),).toBe(true,);
    expect(isTerrainAffectedByWeather("mountain", "wind",),).toBe(true,);
    expect(isTerrainAffectedByWeather("mountain", "snow",),).toBe(true,);
    expect(isTerrainAffectedByWeather("mountain", "rain",),).toBe(false,);
  });

  test("swamp reacts to rain and fog only", () => {
    expect(isTerrainAffectedByWeather("swamp", "rain",),).toBe(true,);
    expect(isTerrainAffectedByWeather("swamp", "fog",),).toBe(true,);
    expect(isTerrainAffectedByWeather("swamp", "storm",),).toBe(false,);
  });

  test("urban resists everything but storm", () => {
    expect(isTerrainAffectedByWeather("urban", "storm",),).toBe(true,);
    expect(isTerrainAffectedByWeather("urban", "rain",),).toBe(false,);
    expect(isTerrainAffectedByWeather("urban", "heatwave",),).toBe(false,);
  });

  test("dungeon and underwater report unaffected", () => {
    expect(isTerrainAffectedByWeather("dungeon", "storm",),).toBe(false,);
    expect(isTerrainAffectedByWeather("underwater", "storm",),).toBe(false,);
  });
});
