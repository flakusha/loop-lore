// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Time/weather widget mixin for the world page (TASK-time-weather). Reads
 * the conditions snapshot the world SSE stream pushes (routes/worlds/
 * world-stream.ts) — display only.
 *
 * HARD SCOPE: no GM time-progression controls, no world clock engine. There
 * is no forecast source in the data model yet, so `forecastAvailable` is
 * always false and the UI shows an explicit empty state instead of a
 * fabricated forecast. Season is not rendered: no season field exists in
 * location_states or world_states.
 */
import { isNight, timeOfDayIcon, weatherIcon, } from "./weather-icons";
import type { WorldPageState, } from "./world-types";

/** Condition display state for the world page widget. */
export const timeWeatherWidget: Partial<WorldPageState> & ThisType<WorldPageState> = {
  timeOfDay: null,
  weather: null,
  conditionsLocationName: null,
  conditionsAt: null,

  /** @returns {boolean} */
  get hasConditions(): boolean {
    return this.timeOfDay !== null || this.weather !== null;
  },

  /** @returns {string} */
  get timeIcon(): string {
    return timeOfDayIcon(this.timeOfDay,);
  },

  /** @returns {string} */
  get weatherIcon(): string {
    return weatherIcon(this.weather,);
  },

  /** Day/night cycle indicator derived from the time-of-day value. */
  /** @returns {string} */
  get dayNightLabel(): string {
    if (!this.timeOfDay) { return "—"; }
    return isNight(this.timeOfDay,) ? "Night" : "Day";
  },

  /** @returns {boolean} */
  get forecastAvailable(): boolean {
    return false;
  },
};
