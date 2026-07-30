/**
 * Weather Integration for NSFW Encounters
 *
 * Weather affects NSFW encounter mood, pheromone dispersion,
 * and location availability.
 */
import type {
  NSFWMoodWithWeather,
  WeatherNSFWModifiers,
} from "./integration-schemas";

/** Weather types that affect NSFW encounters */
export type WeatherType =
  | "clear"
  | "rain"
  | "storm"
  | "snow"
  | "fog"
  | "wind"
  | "heatwave"
  | "cold_snap";

/** Season affecting fertility cycles */
export type Season = "spring" | "summer" | "autumn" | "winter";

/**
 * Get weather modifiers for NSFW encounters.
 *
 * @param weather - Current weather type
 * @param temperature - Temperature in Celsius
 * @param windSpeed - Wind speed in km/h
 * @returns Weather modifiers for NSFW encounters
 */
export function getWeatherModifiers(
  weather: WeatherType,
  temperature: number,
  windSpeed: number,
): WeatherNSFWModifiers {
  let moodModifier: number;
  let pheromoneDispersion: number;
  const locationAvailability: string[] = [];
  let intimacyDifficulty: number;

  switch (weather) {
    case "clear": {
      moodModifier = 2;
      pheromoneDispersion = 1.2;
      locationAvailability.push("outdoor", "garden", "balcony",);
      intimacyDifficulty = -5;
      break;
    }
    case "rain": {
      moodModifier = 1;
      pheromoneDispersion = 0.8;
      locationAvailability.push("indoor", "sheltered",);
      intimacyDifficulty = 5;
      break;
    }
    case "storm": {
      moodModifier = -2;
      pheromoneDispersion = 0.5;
      locationAvailability.push("indoor",);
      intimacyDifficulty = 10;
      break;
    }
    case "snow": {
      moodModifier = 0;
      pheromoneDispersion = 0.7;
      locationAvailability.push("indoor", "fireplace",);
      intimacyDifficulty = 5;
      break;
    }
    case "fog": {
      moodModifier = 1;
      pheromoneDispersion = 1.5; // Fog traps pheromones
      locationAvailability.push("outdoor", "secluded",);
      intimacyDifficulty = -10;
      break;
    }
    case "wind": {
      moodModifier = -1;
      pheromoneDispersion = 0.6;
      locationAvailability.push("indoor", "sheltered",);
      intimacyDifficulty = 10;
      break;
    }
    case "heatwave": {
      moodModifier = 3;
      pheromoneDispersion = 2; // Heat amplifies pheromones
      locationAvailability.push("indoor", "pool", "bath",);
      intimacyDifficulty = -15;
      break;
    }
    case "cold_snap": {
      moodModifier = -2;
      pheromoneDispersion = 0.4;
      locationAvailability.push("indoor", "fireplace",);
      intimacyDifficulty = 15;
      break;
    }
  }

  // Temperature modifiers
  if (temperature > 30) {
    moodModifier += 1;
    pheromoneDispersion *= 1.2;
  } else if (temperature < 0) {
    moodModifier -= 1;
    pheromoneDispersion *= 0.8;
  }

  // Wind affects pheromone dispersion
  if (windSpeed > 30) {
    pheromoneDispersion *= 0.5;
    intimacyDifficulty += 5;
  } else if (windSpeed < 5) {
    pheromoneDispersion *= 1.3;
  }

  return {
    moodModifier: Math.max(-10, Math.min(10, moodModifier,),),
    pheromoneDispersion: Math.max(0.5, Math.min(2, pheromoneDispersion,),),
    locationAvailability,
    intimacyDifficulty: Math.max(-20, Math.min(20, intimacyDifficulty,),),
  };
}

/**
 * Calculate combined mood from character base mood + weather.
 *
 * @param baseMood - Character's base mood (-10 to +10)
 * @param weatherModifier - Weather mood modifier
 * @returns Combined mood for encounter
 */
export function calculateCombinedMood(
  baseMood: number,
  weatherModifier: number,
): NSFWMoodWithWeather {
  const combinedMood = Math.max(-10, Math.min(10, baseMood + weatherModifier,),);

  return {
    baseMood,
    weatherModifier,
    combinedMood,
  };
}

/**
 * Get seasonal fertility modifier.
 *
 * @param season - Current season
 * @param species - Species (some species have seasonal fertility)
 * @returns Fertility multiplier (0.5 to 2.0)
 */
export function getSeasonalFertilityModifier(
  season: Season,
  species = "human",
): number {
  // Default human fertility (relatively stable)
  if (species === "human") {
    switch (season) {
      case "spring": {
        return 1.1;
      }
      case "summer": {
        return 1;
      }
      case "autumn": {
        return 0.9;
      }
      case "winter": {
        return 0.8;
      }
    }
  }

  // Fantasy species with seasonal heat cycles
  if (species === "elf" || species === "fairy") {
    switch (season) {
      case "spring": {
        return 2; // Peak fertility
      }
      case "summer": {
        return 1.5;
      }
      case "autumn": {
        return 1;
      }
      case "winter": {
        return 0.5; // Low fertility
      }
    }
  }

  // Beasts/monsters with spring heat
  if (species === "beast" || species === "monster") {
    switch (season) {
      case "spring": {
        return 2.5; // Heat season
      }
      case "summer": {
        return 1.5;
      }
      case "autumn": {
        return 0.5;
      }
      case "winter": {
        return 0.25; // Hibernation
      }
    }
  }

  return 1;
}

/**
 * Check if weather allows outdoor NSFW encounters.
 *
 * @param weather - Current weather
 * @param temperature - Temperature in Celsius
 * @returns Whether outdoor encounters are possible
 */
export function canEncounterOutdoor(
  weather: WeatherType,
  temperature: number,
): boolean {
  // Extreme weather prevents outdoor encounters
  if (weather === "storm") { return false; }
  if (weather === "cold_snap" && temperature < -10) { return false; }
  if (weather === "heatwave" && temperature > 40) { return false; }

  return true;
}
