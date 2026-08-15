// ── Environmental Modifier (Shared: Weather, Battle) ──────────

/** Weather condition affecting combat */
export type CombatWeather =
  | "clear"
  | "rain"
  | "storm"
  | "snow"
  | "fog"
  | "wind"
  | "heatwave"
  | "cold_snap";

/** Environmental modifier for combat */
export interface EnvironmentalModifier {
  /** Modifier ID */
  id: string;
  /** Source of modifier (weather, terrain, hazard) */
  source: "weather" | "terrain" | "hazard";
  /** What stat is affected */
  affectedStat: string;
  /** Modifier value */
  value: number;
  /** Whether this is a percentage modifier */
  isPercentage: boolean;
  /** Duration in turns (0 = permanent for encounter) */
  duration: number;
  /** Description of the effect */
  description: string;
}

/** Get weather modifiers for combat */
export function getCombatWeatherModifiers(
  weather: CombatWeather,
): EnvironmentalModifier[] {
  const modifiers: EnvironmentalModifier[] = [];

  switch (weather) {
    case "clear":
    case "snow": {
      // Clear skies / snowfall — no combat modifiers modeled.
      break;
    }
    case "rain": {
      modifiers.push({
        id: "rain_accuracy",
        source: "weather",
        affectedStat: "accuracy",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Rain reduces accuracy",
      }, {
        id: "rain_fire",
        source: "weather",
        affectedStat: "magicAttack",
        value: -20,
        isPercentage: true,
        duration: 0,
        description: "Rain weakens fire magic",
      },);
      break;
    }
    case "storm": {
      modifiers.push({
        id: "storm_accuracy",
        source: "weather",
        affectedStat: "accuracy",
        value: -20,
        isPercentage: false,
        duration: 0,
        description: "Storm greatly reduces accuracy",
      }, {
        id: "storm_speed",
        source: "weather",
        affectedStat: "speed",
        value: -15,
        isPercentage: false,
        duration: 0,
        description: "Storm hampers movement",
      },);
      break;
    }
    case "fog": {
      modifiers.push({
        id: "fog_accuracy",
        source: "weather",
        affectedStat: "accuracy",
        value: -15,
        isPercentage: false,
        duration: 0,
        description: "Fog reduces visibility",
      }, {
        id: "fog_dodge",
        source: "weather",
        affectedStat: "dodgeChance",
        value: 10,
        isPercentage: false,
        duration: 0,
        description: "Fog provides concealment",
      },);
      break;
    }
    case "wind": {
      modifiers.push({
        id: "wind_ranged",
        source: "weather",
        affectedStat: "accuracy",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Wind affects ranged attacks",
      },);
      break;
    }
    case "heatwave": {
      modifiers.push({
        id: "heat_stamina",
        source: "weather",
        affectedStat: "stamina",
        value: -20,
        isPercentage: true,
        duration: 0,
        description: "Heat drains stamina faster",
      },);
      break;
    }
    case "cold_snap": {
      modifiers.push({
        id: "cold_speed",
        source: "weather",
        affectedStat: "speed",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Cold slows movement",
      }, {
        id: "cold_attack",
        source: "weather",
        affectedStat: "attack",
        value: -5,
        isPercentage: false,
        duration: 0,
        description: "Cold stiffens muscles",
      },);
      break;
    }
  }

  return modifiers;
}
