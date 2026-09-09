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

  // ── Edge cases ──────────────────────────────────────────────

  test("defaults leave cover at 'none' and elevation at 'medium'", () => {
    const t = createBattleTerrain();
    expect(t.cover,).toBe("none",);
    expect(t.elevation,).toBe("medium",);
  });

  test("returned object is fresh per call (no shared state)", () => {
    const a = createBattleTerrain();
    const b = createBattleTerrain();
    expect(a,).not.toBe(b,);
    a.hazards.push({
      id: "x",
      name: "x",
      damagePerTurn: 0,
      area: "single",
      duration: 0,
      avoidable: true,
      avoidanceDC: 0,
    },);
    expect(b.hazards,).toEqual([],);
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

  // ── Edge cases ──────────────────────────────────────────────

  test("clear weather is not 'affected' for any terrain (clear is benign)", () => {
    expect(isTerrainAffectedByWeather("open", "clear",),).toBe(false,);
    expect(isTerrainAffectedByWeather("desert", "clear",),).toBe(false,);
    expect(isTerrainAffectedByWeather("mountain", "clear",),).toBe(false,);
    expect(isTerrainAffectedByWeather("swamp", "clear",),).toBe(false,);
  });

  test("heatwave affects open terrain but not forest", () => {
    expect(isTerrainAffectedByWeather("open", "heatwave",),).toBe(true,);
    expect(isTerrainAffectedByWeather("forest", "heatwave",),).toBe(false,);
  });

  test("cold_snap affects open but not forest", () => {
    expect(isTerrainAffectedByWeather("open", "cold_snap",),).toBe(true,);
    expect(isTerrainAffectedByWeather("forest", "cold_snap",),).toBe(false,);
  });

  test("snow affects mountain but not open or forest", () => {
    expect(isTerrainAffectedByWeather("mountain", "snow",),).toBe(true,);
    expect(isTerrainAffectedByWeather("open", "snow",),).toBe(false,);
    expect(isTerrainAffectedByWeather("forest", "snow",),).toBe(false,);
  });

  test("rain affects swamp but not open terrain", () => {
    expect(isTerrainAffectedByWeather("swamp", "rain",),).toBe(true,);
    expect(isTerrainAffectedByWeather("open", "rain",),).toBe(false,);
  });

  test("fog affects swamp but not mountain", () => {
    expect(isTerrainAffectedByWeather("swamp", "fog",),).toBe(true,);
    expect(isTerrainAffectedByWeather("mountain", "fog",),).toBe(false,);
  });
});
