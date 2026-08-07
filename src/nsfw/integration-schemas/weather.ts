// ── Weather Integration ───────────────────────────────────────

/** Weather conditions affecting NSFW encounters */
export interface WeatherNSFWModifiers {
  /** Mood modifier (-10 to +10) */
  moodModifier: number;
  /** Pheromone dispersion multiplier (0.5x to 2x) */
  pheromoneDispersion: number;
  /** Which outdoor locations are usable */
  locationAvailability: string[];
  /** Intimacy difficulty modifier (-20 to +20) */
  intimacyDifficulty: number;
}

/** Combined mood from character base + weather */
export interface NSFWMoodWithWeather {
  /** Base mood from character mood system */
  baseMood: number;
  /** Weather modifier */
  weatherModifier: number;
  /** Combined mood for encounter */
  combinedMood: number;
}
