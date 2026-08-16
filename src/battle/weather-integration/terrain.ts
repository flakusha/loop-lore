// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  CombatWeather,
  TerrainType,
} from "../integration-schemas";
import type { BattleTerrain, } from "./types";

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
