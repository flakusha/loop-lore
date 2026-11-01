// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Time/weather widget mixin for the world page (TASK-time-weather). Reads
 * the engine-backed conditions snapshot the world SSE stream pushes
 * (routes/worlds/world-stream.ts) — display only.
 *
 * HARD SCOPE: no GM time-progression controls. There is no forecast source
 * beyond the three-day seeded forecast the stream already derives, so the
 * widget renders exactly what arrives and shows an explicit empty state
 * rather than fabricating data.
 */
import { isNight, seasonIcon, timeOfDayIcon, weatherIcon, } from "./weather-icons";
import type { WorldPageState, } from "./world-types";

/** Condition display state for the world page widget. */
export const timeWeatherWidget: Partial<WorldPageState> & ThisType<WorldPageState> = {
  timeOfDay: null,
  weather: null,
  season: null,
  temperature: null,
  conditionsDay: null,
  forecast: [],

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

  /** @returns {string} */
  get seasonIcon(): string {
    return seasonIcon(this.season,);
  },

  /** Day/night cycle indicator derived from the time-of-day value. */
  /** @returns {boolean} */
  get isNightNow(): boolean {
    return isNight(this.timeOfDay,);
  },

  /** @returns {boolean} */
  get forecastAvailable(): boolean {
    return this.forecast.length > 0;
  },

  /** True only once an engine season value has arrived. */
  /** @returns {boolean} */
  get hasSeason(): boolean {
    return this.season !== null;
  },
};
