// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/conditions-rules.ts — the PURE half of the conditions engine.
 *
 * Everything here is a total function of its arguments and touches no
 * database: the same world-clock minute and weather seed always give the
 * same time-of-day / weather / season / temperature. That is what makes a
 * replay reproduce a run, so the DB half in ./conditions.ts is left with
 * nothing but persistence and scheduling. No `Math.random` anywhere: every
 * draw goes through `mulberry32` from ../autonomy/rng — the same PRNG and
 * the same FNV `hashSeed` the autonomy tick stream uses, so conditions
 * and autonomy cannot drift into two notions of "same seed".
 */
import { hashSeed, mulberry32, } from "../autonomy/rng";

/** How the world's conditions are advanced. */
export const WorldConditionMode = {
  /** Follow real elapsed minutes. */
  RealTime: "real_time",
  /** Advance on the scheduler's fixed interval. */
  Tick: "tick",
  /** Only the explicit advance endpoint moves the clock. */
  Manual: "manual",
} as const;
export type WorldConditionMode = (typeof WorldConditionMode)[keyof typeof WorldConditionMode];

/** Time-of-day periods, in clock order. `dawn` is hour 5. */
export const TIME_OF_DAY = {
  Dawn: "dawn",
  Morning: "morning",
  Afternoon: "afternoon",
  Evening: "evening",
  Night: "night",
} as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[keyof typeof TIME_OF_DAY];

/** The seasons, in calendar order. */
export const SEASON = {
  Spring: "spring",
  Summer: "summer",
  Autumn: "autumn",
  Winter: "winter",
} as const;
export type Season = (typeof SEASON)[keyof typeof SEASON];

/** Weather the roll can land on. Object order is the draw order. */
export const WEATHER = {
  Clear: "clear",
  Cloudy: "cloudy",
  Fog: "fog",
  Rain: "rain",
  Storm: "storm",
  Snow: "snow",
  Wind: "wind",
} as const;
export type Weather = (typeof WEATHER)[keyof typeof WEATHER];

/** World-minutes in a world-day. Mirrors timescale.ts's private constant. */
export const MINUTES_PER_DAY = 1440;

/** World-days one season lasts before the next begins. */
export const SEASON_LENGTH_DAYS = 7;

/** Mean temperature per season, in degrees. */
const SEASON_BASE_TEMPERATURE: Record<Season, number> = {
  spring: 15,
  summer: 28,
  autumn: 12,
  winter: 0,
};

/** Temperature swing applied by the time of day, in degrees. */
const TIME_OF_DAY_TEMPERATURE_SWING: Record<TimeOfDay, number> = {
  dawn: -4,
  morning: -1,
  afternoon: 3,
  evening: -2,
  night: -6,
};

/** Weather to sight range, in metres. */
const WEATHER_VISIBILITY: Record<Weather, number> = {
  clear: 1000,
  cloudy: 800,
  fog: 120,
  rain: 500,
  storm: 250,
  snow: 300,
  wind: 700,
};

/** Weather to extra fatigue per world-hour spent outdoors. */
const WEATHER_FATIGUE: Record<Weather, number> = {
  clear: 0,
  cloudy: 0,
  fog: 1,
  rain: 2,
  storm: 4,
  snow: 3,
  wind: 2,
};

/** Season to endurance multiplier (1 = neutral). */
const SEASON_ENDURANCE: Record<Season, number> = {
  spring: 1.0,
  summer: 0.9,
  autumn: 1.0,
  winter: 0.8,
};

/** The season order a season count cycles through. */
const SEASON_ORDER: readonly Season[] = [
  SEASON.Spring,
  SEASON.Summer,
  SEASON.Autumn,
  SEASON.Winter,
];

/** The time-of-day bands as [first hour, period]; hour 24 is unreachable. */
const TIME_OF_DAY_BANDS: ReadonlyArray<readonly [number, TimeOfDay,]> = [
  [5, TIME_OF_DAY.Night,],
  [8, TIME_OF_DAY.Dawn,],
  [12, TIME_OF_DAY.Morning,],
  [18, TIME_OF_DAY.Afternoon,],
  [22, TIME_OF_DAY.Evening,],
];

/** The condition values a modifier is derived from. */
export interface ConditionSample {
  weather: Weather;
  timeOfDay: TimeOfDay;
  season: Season;
  temperature: number;
}

/** Environment modifiers as plain data — no combat or economy types. */
export interface EnvironmentModifiers {
  /** Sight range in metres under this weather. */
  weatherVisibility: number;
  /** Extra fatigue per world-hour outdoors under this weather. */
  temperatureFatigue: number;
  /** Endurance multiplier for the current season. */
  seasonEffect: number;
}

/**
 * The world-day a world-clock minute falls on, 1-based. Day 1 00:00 is
 * minute 0.
 * @param worldMinutes world-clock minutes since the epoch anchor
 * @returns the 1-based day number
 */
export function dayOf(worldMinutes: number,): number {
  return Math.floor(worldMinutes / MINUTES_PER_DAY,) + 1;
}

/**
 * The hour-of-day (0-23) a world-clock minute falls on.
 * @param worldMinutes world-clock minutes since the epoch anchor
 * @returns the hour of the day
 */
export function hourOf(worldMinutes: number,): number {
  return Math.floor((worldMinutes % MINUTES_PER_DAY) / 60,);
}

/**
 * The period a world-clock minute falls in.
 * @param worldMinutes world-clock minutes since the epoch anchor
 * @returns the time-of-day period
 */
export function timeOfDayAt(worldMinutes: number,): TimeOfDay {
  const hour = hourOf(worldMinutes,);
  for (const [firstHour, period,] of TIME_OF_DAY_BANDS) {
    if (hour < firstHour) { return period; }
  }

  return TIME_OF_DAY.Night;
}

/**
 * The season a world-clock minute falls in. Seasons turn every
 * {@link SEASON_LENGTH_DAYS} world-days, cycling spring, summer, autumn,
 * winter.
 * @param worldMinutes world-clock minutes since the epoch anchor
 * @returns the season
 */
export function seasonAt(worldMinutes: number,): Season {
  const minutesPerSeason = MINUTES_PER_DAY * SEASON_LENGTH_DAYS;
  const seasonIndex = Math.floor(worldMinutes / minutesPerSeason,);
  return SEASON_ORDER[seasonIndex % SEASON_ORDER.length] ?? SEASON.Spring;
}

/**
 * The weather for one world-day under one seed. A pure function of
 * (seed, day): advancing the same world twice lands the same weather on
 * the same day, and two seeds diverge.
 * @param seed the persisted weather seed
 * @param day the 1-based world-day
 * @returns the rolled weather
 */
export function weatherAt(seed: number, day: number,): Weather {
  const rng = mulberry32(hashSeed(seed, "conditions", day,),);
  const options = Object.values(WEATHER,);
  const index = Math.floor(rng() * options.length,);
  return options[index] ?? WEATHER.Clear;
}

/**
 * The temperature for a period, season and weather. Snow only settles in
 * winter; the rest is a season mean nudged by the diurnal swing.
 * @param season the current season
 * @param timeOfDay the current period
 * @param weather the current weather
 * @returns the temperature in degrees
 */
export function temperatureAt(season: Season, timeOfDay: TimeOfDay, weather: Weather,): number {
  const base = SEASON_BASE_TEMPERATURE[season];
  const swing = TIME_OF_DAY_TEMPERATURE_SWING[timeOfDay];
  const wintry = season === SEASON.Winter || weather === WEATHER.Snow ? -3 : 0;
  return base + swing + wintry;
}

/**
 * Derive the environment modifiers a consumer (combat, exploration, NPC
 * scheduling) applies. Data only — this module deliberately imports
 * nothing from those systems, so the dependency runs one way.
 * @param conditions the current weather / period / season / temperature
 * @returns visibility, fatigue and season multipliers
 */
export function buildEnvironmentModifiers(conditions: ConditionSample,): EnvironmentModifiers {
  return {
    weatherVisibility: WEATHER_VISIBILITY[conditions.weather] ?? WEATHER_VISIBILITY.clear,
    temperatureFatigue: WEATHER_FATIGUE[conditions.weather] ?? 0,
    seasonEffect: SEASON_ENDURANCE[conditions.season] ?? 1,
  };
}
