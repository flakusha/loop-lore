/**
 * Weather Integration for Battle
 *
 * Environmental combat modifiers, terrain effects, and hazards.
 */
import type {
  CombatStats,
  CombatWeather,
  EnvironmentalModifier,
  TerrainType,
} from "./integration-schemas";
import {
  getCombatTerrainModifiers,
  getCombatWeatherModifiers,
} from "./integration-schemas";

/** Terrain cover type */
export type CoverType = "none" | "half" | "three_quarters" | "full";

/** Terrain elevation */
export type Elevation = "low" | "medium" | "high" | "extreme";

/** Battle terrain state */
export interface BattleTerrain {
  /** Terrain type */
  type: TerrainType;
  /** Current weather */
  weather: CombatWeather;
  /** Cover available */
  cover: CoverType;
  /** Elevation level */
  elevation: Elevation;
  /** Whether terrain is difficult */
  difficultTerrain: boolean;
  /** Environmental hazards present */
  hazards: EnvironmentalHazard[];
}

/** Environmental hazard */
export interface EnvironmentalHazard {
  /** Hazard ID */
  id: string;
  /** Hazard name */
  name: string;
  /** Damage per turn */
  damagePerTurn: number;
  /** Affected area */
  area: "single" | "cone" | "line" | "area";
  /** Duration in turns */
  duration: number;
  /** Whether it can be avoided */
  avoidable: boolean;
  /** DC to avoid */
  avoidanceDC: number;
}

/** Calculate cover bonus to AC/defense */
export function calculateCoverBonus(cover: CoverType,): number {
  switch (cover) {
    case "none": {
      return 0;
    }
    case "half": {
      return 2;
    }
    case "three_quarters": {
      return 5;
    }
    case "full": {
      return 10;
    }
  }
}

/** Calculate elevation advantage */
export function calculateElevationBonus(
  attackerElevation: Elevation,
  targetElevation: Elevation,
): { attackBonus: number; damageBonus: number } {
  const elevationOrder: Elevation[] = ["low", "medium", "high", "extreme",];
  const attackerIndex = elevationOrder.indexOf(attackerElevation,);
  const targetIndex = elevationOrder.indexOf(targetElevation,);

  const difference = attackerIndex - targetIndex;

  if (difference > 0) {
    // Attacker has elevation advantage
    return {
      attackBonus: difference * 2,
      damageBonus: difference * 1,
    };
  }
  if (difference < 0) {
    // Attacker has elevation disadvantage
    return {
      attackBonus: difference * 2,
      damageBonus: Math.min(0, difference,),
    };
  }

  return { attackBonus: 0, damageBonus: 0, };
}

/** Get all environmental modifiers for a battle terrain */
export function getEnvironmentalModifiers(
  terrain: BattleTerrain,
): EnvironmentalModifier[] {
  const modifiers: EnvironmentalModifier[] = [];

  // Add weather and terrain modifiers
  modifiers.push(
    ...getCombatWeatherModifiers(terrain.weather,),
    ...getCombatTerrainModifiers(terrain.type,),
  );

  // Add cover modifier
  const coverBonus = calculateCoverBonus(terrain.cover,);
  if (coverBonus > 0) {
    modifiers.push({
      id: "cover_defense",
      source: "terrain",
      affectedStat: "defense",
      value: coverBonus,
      isPercentage: false,
      duration: 0,
      description: `Cover provides +${coverBonus} defense`,
    },);
  }

  // Add difficult terrain modifier
  if (terrain.difficultTerrain) {
    modifiers.push({
      id: "difficult_terrain_speed",
      source: "terrain",
      affectedStat: "speed",
      value: -10,
      isPercentage: false,
      duration: 0,
      description: "Difficult terrain reduces speed",
    },);
  }

  return modifiers;
}

/** Apply environmental modifiers to combat stats */
export function applyEnvironmentalModifiers(
  baseStats: CombatStats,
  modifiers: EnvironmentalModifier[],
): CombatStats {
  const modified = { ...baseStats, };

  for (const mod of modifiers) {
    const currentValue = modified[mod.affectedStat as keyof CombatStats];
    if (typeof currentValue === "number") {
      const newValue = mod.isPercentage ? Math.round(currentValue * (1 + mod.value / 100),) : currentValue + mod.value;
      (modified as Record<string, unknown>)[mod.affectedStat] = newValue;
    }
  }

  // Clamp values
  modified.health = Math.max(0, Math.min(modified.maxHealth, modified.health,),);
  modified.mana = Math.max(0, Math.min(modified.maxMana, modified.mana,),);
  modified.stamina = Math.max(0, Math.min(modified.maxStamina, modified.stamina,),);
  modified.criticalChance = Math.max(0, Math.min(100, modified.criticalChance,),);
  modified.dodgeChance = Math.max(0, Math.min(100, modified.dodgeChance,),);
  modified.accuracy = Math.max(0, Math.min(100, modified.accuracy,),);

  return modified;
}

/** Create default battle terrain */
export function createBattleTerrain(
  type: TerrainType = "open",
  weather: CombatWeather = "clear",
): BattleTerrain {
  return {
    type,
    weather,
    cover: "none",
    elevation: "medium",
    difficultTerrain: false,
    hazards: [],
  };
}

/** Check if terrain is affected by weather */
export function isTerrainAffectedByWeather(
  terrain: TerrainType,
  weather: CombatWeather,
): boolean {
  // Open terrain is most affected by weather
  if (["open", "desert",].includes(terrain,)) {
    return ["storm", "heatwave", "cold_snap",].includes(weather,);
  }

  // Forest affected by storms and wind
  if (terrain === "forest") {
    return ["storm", "wind",].includes(weather,);
  }

  // Mountain affected by cold and wind
  if (terrain === "mountain") {
    return ["cold_snap", "wind", "snow",].includes(weather,);
  }

  // Swamp affected by rain and fog
  if (terrain === "swamp") {
    return ["rain", "fog",].includes(weather,);
  }

  // Urban areas less affected
  if (terrain === "urban") {
    return weather === "storm";
  }

  return false;
}

/** Calculate weather visibility */
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

/** Generate random environmental hazard */
export function generateEnvironmentalHazard(
  terrain: TerrainType,
  weather: CombatWeather,
): EnvironmentalHazard | null {
  // Check for weather-based hazards
  if (weather === "storm" && Math.random() < 0.3) {
    return {
      id: crypto.randomUUID(),
      name: "Lightning Strike",
      damagePerTurn: 20,
      area: "single",
      duration: 1,
      avoidable: true,
      avoidanceDC: 15,
    };
  }

  if (weather === "heatwave" && Math.random() < 0.2) {
    return {
      id: crypto.randomUUID(),
      name: "Heat Exhaustion",
      damagePerTurn: 5,
      area: "single",
      duration: 3,
      avoidable: true,
      avoidanceDC: 12,
    };
  }

  // Check for terrain-based hazards
  if (terrain === "swamp" && Math.random() < 0.25) {
    return {
      id: crypto.randomUUID(),
      name: "Toxic Gas",
      damagePerTurn: 8,
      area: "area",
      duration: 2,
      avoidable: true,
      avoidanceDC: 13,
    };
  }

  if (terrain === "dungeon" && Math.random() < 0.2) {
    return {
      id: crypto.randomUUID(),
      name: "Trap",
      damagePerTurn: 15,
      area: "single",
      duration: 1,
      avoidable: true,
      avoidanceDC: 14,
    };
  }

  return null;
}
