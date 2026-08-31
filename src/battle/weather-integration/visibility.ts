// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { CombatWeather, } from "../integration-schemas";

/**
 * Calculate weather visibility
 * @param weather
 * @param timeOfDay
 */
export function calculateVisibility(
  weather: CombatWeather,
  timeOfDay: number, // 0-23
): number {
  let visibility: number;

  switch (weather) {
    case "clear": {
      visibility = 100;
      break;
    }
    case "rain": {
      visibility = 70;
      break;
    }
    case "storm": {
      visibility = 40;
      break;
    }
    case "snow": {
      visibility = 60;
      break;
    }
    case "fog": {
      visibility = 30;
      break;
    }
    case "wind": {
      visibility = 80;
      break;
    }
    case "heatwave": {
      visibility = 90; // Heat haze
      break;
    }
    case "cold_snap": {
      visibility = 85; // Clear but cold
      break;
    }
  }

  // Time of day modifier
  if (timeOfDay >= 20 || timeOfDay < 6) {
    visibility *= 0.5; // Nighttime
  } else if (timeOfDay >= 18 || timeOfDay < 8) {
    visibility *= 0.7; // Dawn/dusk
  }

  return Math.max(10, Math.min(100, Math.round(visibility,),),);
}
