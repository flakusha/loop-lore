// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { isNight, timeOfDayIcon, WEATHER_ICONS, weatherIcon, } from "./weather-icons";

describe("weatherIcon", () => {
  test("maps known weather values", () => {
    expect(weatherIcon("clear",),).toBe("☀️",);
    expect(weatherIcon("cloudy",),).toBe("☁️",);
  });

  test("normalizes case and whitespace", () => {
    expect(weatherIcon("  Clear  ",),).toBe(WEATHER_ICONS["clear"]!,);
    expect(weatherIcon("RAIN",),).toBe(WEATHER_ICONS["rain"]!,);
  });

  test("falls back for unknown values and empty input", () => {
    expect(weatherIcon("ashfall",),).not.toBe("",);
    expect(weatherIcon(null,),).toBe("",);
    expect(weatherIcon("",),).toBe("",);
  });
});

describe("timeOfDayIcon", () => {
  test("maps known times of day", () => {
    expect(timeOfDayIcon("morning",),).toBe("🌅",);
    expect(timeOfDayIcon("dawn",),).toBe("🌅",);
  });

  test("falls back for unknown values and empty input", () => {
    expect(timeOfDayIcon("wizards'_hour",),).not.toBe("",);
    expect(timeOfDayIcon(null,),).toBe("",);
  });
});

describe("isNight", () => {
  test("classifies night times", () => {
    expect(isNight("dusk",),).toBe(true,);
    expect(isNight("midnight",),).toBe(true,);
  });

  test("classifies day times and empty input", () => {
    expect(isNight("morning",),).toBe(false,);
    expect(isNight("noon",),).toBe(false,);
    expect(isNight(null,),).toBe(false,);
  });

  test("is case-insensitive", () => {
    expect(isNight("Dusk",),).toBe(true,);
  });
});
