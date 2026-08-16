// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export {
  generateEnvironmentalHazard,
} from "./hazards";
export {
  applyEnvironmentalModifiers,
  getEnvironmentalModifiers,
} from "./modifiers";
export {
  calculateCoverBonus,
  calculateElevationBonus,
} from "./position";
export {
  createBattleTerrain,
  isTerrainAffectedByWeather,
} from "./terrain";
export type {
  BattleTerrain,
  CoverType,
  Elevation,
  EnvironmentalHazard,
} from "./types";
export {
  calculateVisibility,
} from "./visibility";
