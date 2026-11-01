// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Focused coverage for the time-weather widget members the world-page state
 * test does not exercise (season/forecast/day-night contract, iconForWeather).
 * Pure getters — no DOM, no network.
 */

import { describe, expect, test, } from "bun:test";
import { timeWeatherWidget, } from "./time-weather";

/** Live-getter view over the mixin: prototype chain keeps `this` working (test seam). */
function asState(
  overrides: Partial<Pick<typeof timeWeatherWidget, "timeOfDay" | "weather" | "season" | "forecast">>,
): typeof timeWeatherWidget {
  return Object.assign(Object.create(timeWeatherWidget,), overrides,) as typeof timeWeatherWidget;
}

describe("timeWeatherWidget remaining members", () => {
  test("isNightNow tracks the night set and is false without a time", () => {
    expect(asState({ timeOfDay: "midnight", },).isNightNow,).toBe(true,);
    expect(asState({ timeOfDay: "noon", },).isNightNow,).toBe(false,);
    expect(asState({},).isNightNow,).toBe(false,);
  });

  test("iconForWeather maps an arbitrary forecast value and empties on null", () => {
    const ctx = asState({ weather: "storm", },);
    expect(ctx.iconForWeather!("rain",),).not.toBe("",);
    expect(ctx.iconForWeather!("unheard-of",),).not.toBe("",);
    expect(ctx.iconForWeather!(null,),).toBe("",);
  });

  test("seasonIcon resolves set seasons and empties without one", () => {
    expect(asState({ season: "Harvest", },).seasonIcon,).not.toBe("",);
    expect(asState({ season: "unheard-of", },).seasonIcon,).not.toBe("",);
    expect(asState({},).seasonIcon,).toBe("",);
  });

  test("forecastAvailable reflects a non-empty engine forecast", () => {
    expect(asState({},).forecastAvailable,).toBe(false,);
    expect(asState({ forecast: [{ day: "tomorrow", weather: "rain", },], } as never,).forecastAvailable,).toBe(true,);
  });

  test("hasSeason is false until an engine season value has arrived", () => {
    expect(asState({},).hasSeason,).toBe(false,);
    expect(asState({ season: "Harvest", },).hasSeason,).toBe(true,);
  });

  test("defaults keep engine slots empty", () => {
    const fresh = asState({},);
    expect(fresh.season,).toBeNull();
    expect(fresh.temperature,).toBeNull();
    expect(fresh.conditionsDay,).toBeNull();
    expect(fresh.forecast,).toEqual([],);
  });
});
