// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Focused coverage for the time-weather widget getters that the world-page
 * state test does not exercise (Day branch of dayNightLabel, forecast/
 * season/author-set contract). Pure getters — no DOM, no network.
 */

import { describe, expect, test, } from "bun:test";
import { timeWeatherWidget, } from "./time-weather";

/** Live-getter view over the mixin: prototype chain keeps `this` working (test seam). */
function asState(
  overrides: Partial<Pick<typeof timeWeatherWidget, "timeOfDay" | "weather" | "season">>,
): typeof timeWeatherWidget {
  return Object.assign(Object.create(timeWeatherWidget,), overrides,) as typeof timeWeatherWidget;
}

describe("timeWeatherWidget remaining getters", () => {
  test("dayNightLabel classifies daytime values as Day", () => {
    const day = asState({ timeOfDay: "noon", },);
    expect(day.dayNightLabel,).toBe("Day",);
    expect(asState({ timeOfDay: "morning", },).dayNightLabel,).toBe("Day",);
  });

  test("forecastAvailable is always false — no forecast source in the model", () => {
    expect(asState({ timeOfDay: "midnight", },).forecastAvailable,).toBe(false,);
    expect(asState({},).forecastAvailable,).toBe(false,);
  });

  test("hasSeason is false while no season value is author-set", () => {
    expect(asState({},).hasSeason,).toBe(false,);
    const withSeason = asState({ season: "Harvest", },);
    expect(withSeason.hasSeason,).toBe(true,);
  });

  test("conditions are always labeled author-set, never simulated", () => {
    expect(asState({},).conditionsAreAuthorSet,).toBe(true,);
  });

  test("defaults keep the season slot and condition provenance empty", () => {
    const fresh = asState({},);
    expect(fresh.season,).toBeNull();
    expect(fresh.conditionsLocationName,).toBeNull();
    expect(fresh.conditionsAt,).toBeNull();
  });
});
