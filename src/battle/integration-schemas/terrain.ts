import type { EnvironmentalModifier, } from "./weather";

/** Terrain type affecting combat */
export type TerrainType =
  | "open"
  | "forest"
  | "mountain"
  | "swamp"
  | "desert"
  | "urban"
  | "dungeon"
  | "underwater";

/** Get terrain modifiers for combat */
export function getCombatTerrainModifiers(
  terrain: TerrainType,
): EnvironmentalModifier[] {
  const modifiers: EnvironmentalModifier[] = [];

  switch (terrain) {
    case "forest": {
      modifiers.push({
        id: "forest_dodge",
        source: "terrain",
        affectedStat: "dodgeChance",
        value: 15,
        isPercentage: false,
        duration: 0,
        description: "Trees provide cover",
      }, {
        id: "forest_ranged",
        source: "terrain",
        affectedStat: "accuracy",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Trees obstruct ranged attacks",
      },);
      break;
    }
    case "mountain": {
      modifiers.push({
        id: "mountain_defense",
        source: "terrain",
        affectedStat: "defense",
        value: 10,
        isPercentage: false,
        duration: 0,
        description: "High ground advantage",
      }, {
        id: "mountain_speed",
        source: "terrain",
        affectedStat: "speed",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Difficult terrain",
      },);
      break;
    }
    case "open":
    case "desert":
    case "urban":
    case "dungeon": {
      // Open ground / arid / built-up / enclosed — no combat modifiers modeled.
      break;
    }
    case "swamp": {
      modifiers.push({
        id: "swamp_speed",
        source: "terrain",
        affectedStat: "speed",
        value: -20,
        isPercentage: false,
        duration: 0,
        description: "Boggy terrain slows movement",
      }, {
        id: "swamp_dodge",
        source: "terrain",
        affectedStat: "dodgeChance",
        value: -10,
        isPercentage: false,
        duration: 0,
        description: "Limited maneuverability",
      },);
      break;
    }
    case "underwater": {
      modifiers.push({
        id: "water_speed",
        source: "terrain",
        affectedStat: "speed",
        value: -30,
        isPercentage: false,
        duration: 0,
        description: "Water resistance",
      }, {
        id: "water_magic",
        source: "terrain",
        affectedStat: "magicAttack",
        value: 20,
        isPercentage: true,
        duration: 0,
        description: "Water amplifies ice/water magic",
      },);
      break;
    }
  }

  return modifiers;
}
