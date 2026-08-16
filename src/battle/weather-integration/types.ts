// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  CombatWeather,
  TerrainType,
} from "../integration-schemas";

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
