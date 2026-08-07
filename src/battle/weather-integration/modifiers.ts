import type {
  CombatStats,
  EnvironmentalModifier,
} from "../integration-schemas";
import {
  getCombatTerrainModifiers,
  getCombatWeatherModifiers,
} from "../integration-schemas";
import { calculateCoverBonus, } from "./position";
import type { BattleTerrain, } from "./types";

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
