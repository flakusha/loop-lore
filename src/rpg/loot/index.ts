// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export type {
  LootDrop,
  LootEntry,
  LootResult,
  Rarity,
} from "./types.js";

export {
  effectiveWeight,
  RARITY_WEIGHTS,
} from "./weights.js";

export { generateLoot, } from "./generation.js";

export { persistLoot, toCategory, } from "./persist.js";

export {
  ARMOR_LOOT,
  COMMON_CONSUMABLES,
  WEAPON_LOOT,
} from "./templates.js";

export {
  createLootTable,
  mergeLootTables,
} from "./table.js";
