// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rarity-weighted lore selection — epic-lore-knowledge.
 *
 * Every lore row carries a unified rarity tier (084 migration, canonical
 * `ItemRarity` scale shared with items/loot). After the deterministic
 * activation gates pass, a non-common entry is admitted stochastically with
 * tier weight: the rarer the tier, the less often the entry is selected into
 * a prompt, so high-tier knowledge surfaces sparingly even when its keys
 * match every turn. Common (weight 1) and unknown/missing values always pass
 * — pre-existing rows are all common, so worlds that never set rarity see no
 * behavior change.
 *
 * "Rare lore discoverable only through rare events" is expressed by pairing
 * a rarity tier with a `reveal_condition` `event` leaf
 * (see `reveal-condition.ts`): the condition gates *whether* the entry can
 * appear at all, the tier weight gates *how often* it appears afterwards.
 */
import { ItemRarity, } from "../../db/enums";

/**
 * Selection weight per rarity tier (probability an otherwise-activated entry
 * is admitted). Common = 1 keeps default behavior; each step down roughly
 * halves how often the tier surfaces.
 */
export const LORE_RARITY_WEIGHTS: Record<ItemRarity, number> = {
  [ItemRarity.Common]: 1,
  [ItemRarity.Uncommon]: 0.75,
  [ItemRarity.Rare]: 0.5,
  [ItemRarity.Epic]: 0.35,
  [ItemRarity.Legendary]: 0.25,
  [ItemRarity.Unique]: 0.15,
  [ItemRarity.Artifact]: 0.1,
};

/**
 * Rarity-weighted admission for an already-activated lore entry.
 * @param rarity Raw `rarity` column value; null/blank/unknown tiers always
 *   pass (tolerant to legacy rows and hand-edited data).
 * @returns True when the entry survives its tier's selection weight.
 */
export function passesRarityWeight(rarity: string | null | undefined,): boolean {
  if (rarity == null || rarity === "") { return true; }
  const weight = LORE_RARITY_WEIGHTS[rarity as ItemRarity];
  if (weight === undefined || weight >= 1) { return true; }
  return Math.random() < weight;
}
