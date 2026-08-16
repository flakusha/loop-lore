// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Service
 *
 * Database persistence for RPG mechanics:
 * - Dice roll logging
 * - Character stat management
 * - XP tracking
 * - Loot table management
 */
export {
  createCharacterStats,
  type CreateCharacterStatsParams,
  getCharacterStats,
  updateCharacterStats,
  type UpdateCharacterStatsParams,
} from "./character-stats.js";
export {
  getDiceRollHistory,
  logDiceRoll,
  type LogDiceRollParams,
} from "./dice-roll.js";
export {
  addLootEntry,
  type AddLootEntryParams,
  createLootTable,
  type CreateLootTableParams,
  rollLootTable,
} from "./loot-tables.js";
export type { RpgServiceDeps, } from "./types.js";
export {
  getXpHistory,
  logXp,
  type LogXpParams,
} from "./xp.js";
