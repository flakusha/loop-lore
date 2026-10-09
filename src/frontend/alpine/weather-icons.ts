// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Weather + time-of-day iconography for the world time/weather widget
 * (TASK-time-weather). Pure mapping tables — no DOM, no network — so the
 * widget rendering stays testable and the tables are shared by the world
 * dashboard cards and the location details panel.
 */

/** Weather value → icon. Unrecognized values fall back to 🌡. */
export const WEATHER_ICONS: Record<string, string> = {
  clear: "☀️",
  sunny: "☀️",
  cloudy: "☁️",
  overcast: "☁️",
  fog: "🌫️",
  foggy: "🌫️",
  mist: "🌫️",
  rain: "🌧️",
  rainy: "🌧️",
  drizzle: "🌦️",
  showers: "🌦️",
  storm: "⛈️",
  stormy: "⛈️",
  thunderstorm: "⛈️",
  snow: "🌨️",
  snowy: "🌨️",
  blizzard: "❄️",
  wind: "🌬️",
  windy: "🌬️",
  humid: "💧",
  dry: "🏜️",
  "acid rain": "☣️",
};

/** Time-of-day value → icon. Unrecognized values fall back to 🕑. */
export const TIME_OF_DAY_ICONS: Record<string, string> = {
  dawn: "🌅",
  sunrise: "🌅",
  morning: "🌅",
  noon: "☀️",
  midday: "☀️",
  afternoon: "🌞",
  evening: "🌆",
  dusk: "🌆",
  sunset: "🌇",
  night: "🌙",
  midnight: "🌜",
};

/** Time-of-day values that count as night for the day/night indicator. */
export const NIGHT_TIME_OF_DAY: ReadonlySet<string> = new Set([
  "dusk",
  "evening",
  "sunset",
  "night",
  "midnight",
  "late night",
],);

const WEATHER_FALLBACK = "🌡️";
const TIME_FALLBACK = "🕑";

/**
 * @param weather raw location_states.weather value
 * @returns icon for the weather, empty string when no weather is set
 */
export function weatherIcon(weather: string | null,): string {
  if (!weather) { return ""; }
  return WEATHER_ICONS[weather.trim().toLowerCase()] ?? WEATHER_FALLBACK;
}

/**
 * @param timeOfDay raw location_states.time_of_day value
 * @returns icon for the time of day, empty string when not set
 */
export function timeOfDayIcon(timeOfDay: string | null,): string {
  if (!timeOfDay) { return ""; }
  return TIME_OF_DAY_ICONS[timeOfDay.trim().toLowerCase()] ?? TIME_FALLBACK;
}

/**
 * @param timeOfDay raw location_states.time_of_day value
 * @returns true when the value reads as night (drives the day/night badge)
 */
export function isNight(timeOfDay: string | null,): boolean {
  if (!timeOfDay) { return false; }
  return NIGHT_TIME_OF_DAY.has(timeOfDay.trim().toLowerCase(),);
}
