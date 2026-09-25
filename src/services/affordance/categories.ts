// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Closed item-category seed for the affordance lookup.
 * Mirrors the canonical categories from the prior batch's
 * `TASK-affordance-lookup-table` ticket (6 categories) and stays disjoint
 * from the broader 14-value `ItemCategory` in `db/enums-story/items.ts` —
 * the affordance matrix collapses to a 6-cell grid and novel items
 * (anything outside this list) get the `novel_item_default` affordance.
 */

export const CATEGORIES = [
  "weapon",
  "armor",
  "consumable",
  "key",
  "quest",
  "tool",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_DISPLAY: Record<Category, string> = {
  weapon: "Weapon",
  armor: "Armor",
  consumable: "Consumable",
  key: "Key / Key Item",
  quest: "Quest Item",
  tool: "Tool",
};
