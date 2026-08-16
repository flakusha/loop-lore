// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  CombatWeather,
  TerrainType,
} from "../integration-schemas";
import type { EnvironmentalHazard, } from "./types";

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
