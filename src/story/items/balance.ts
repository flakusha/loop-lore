// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Items Service — Power Budget
 *
 * Caps and audits item power. Budgets are keyed by `ItemCategory`; the rarity
 * drift caps clamp `applyDrift` per stat, and a category budget can only tighten
 * that clamp — never loosen it. A unique item (unbounded rarity cap) therefore
 * still cannot drift past its category budget.
 */
import { ItemCategory, ItemRarity, } from "../../db/enums";
import { parseItemEffects, } from "./effects";
import type { ItemEffect, } from "./effects";
import type { ItemDefinition, ItemDrift, ItemInstance, } from "./types";

/** Per-category ceiling on the power an item may carry. */
export interface ItemPowerBudget {
  maxStatDelta: number;
  maxEffectCount: number;
  maxDurability: number;
  maxDriftPct: number;
}

/** Conservative starting budgets; retune during the epic balance pass. */
export const ITEM_POWER_BUDGETS: Record<ItemCategory, ItemPowerBudget> = {
  [ItemCategory.Weapon]: { maxStatDelta: 5, maxEffectCount: 2, maxDurability: 100, maxDriftPct: 0.15, },
  [ItemCategory.Armor]: { maxStatDelta: 5, maxEffectCount: 2, maxDurability: 100, maxDriftPct: 0.15, },
  [ItemCategory.Consumable]: { maxStatDelta: 3, maxEffectCount: 1, maxDurability: 20, maxDriftPct: 0.05, },
  [ItemCategory.KeyItem]: { maxStatDelta: 0, maxEffectCount: 0, maxDurability: 10, maxDriftPct: 0, },
  [ItemCategory.QuestItem]: { maxStatDelta: 0, maxEffectCount: 0, maxDurability: 10, maxDriftPct: 0, },
  [ItemCategory.Material]: { maxStatDelta: 1, maxEffectCount: 1, maxDurability: 20, maxDriftPct: 0.05, },
  [ItemCategory.Tool]: { maxStatDelta: 2, maxEffectCount: 1, maxDurability: 50, maxDriftPct: 0.05, },
  [ItemCategory.Container]: { maxStatDelta: 1, maxEffectCount: 1, maxDurability: 50, maxDriftPct: 0.05, },
  [ItemCategory.Treasure]: { maxStatDelta: 2, maxEffectCount: 1, maxDurability: 20, maxDriftPct: 0.05, },
  [ItemCategory.Book]: { maxStatDelta: 0, maxEffectCount: 1, maxDurability: 20, maxDriftPct: 0, },
  [ItemCategory.Artifact]: { maxStatDelta: 10, maxEffectCount: 3, maxDurability: 250, maxDriftPct: 0.3, },
  [ItemCategory.Misc]: { maxStatDelta: 2, maxEffectCount: 1, maxDurability: 50, maxDriftPct: 0.05, },
  [ItemCategory.Other]: { maxStatDelta: 2, maxEffectCount: 1, maxDurability: 50, maxDriftPct: 0.05, },
};

/**
 * Per-rarity ceiling on a single stat's drift multiplier, applied by
 * `applyDrift`. Unique/artifact are unbounded here on purpose — the category
 * budget above is what stops a unique item from drifting forever.
 */
export const DRIFT_CAPS: Record<ItemRarity, number> = {
  [ItemRarity.Common]: 0.05,
  [ItemRarity.Uncommon]: 0.1,
  [ItemRarity.Rare]: 0.15,
  [ItemRarity.Epic]: 0.2,
  [ItemRarity.Legendary]: 0.3,
  [ItemRarity.Unique]: Number.POSITIVE_INFINITY,
  [ItemRarity.Artifact]: Number.POSITIVE_INFINITY,
};

/**
 * The drift clamp actually applied for an instance: the tighter of the rarity
 * cap and the category budget.
 * @param rarity
 * @param category
 * @returns {number}
 */
export function driftCapFor(rarity: ItemRarity, category: ItemCategory,): number {
  return Math.min(DRIFT_CAPS[rarity] ?? 0, powerBudgetFor(category,).maxDriftPct,);
}

/**
 * Budget lookup that never returns undefined for an out-of-enum category.
 * @param category
 */
export function powerBudgetFor(category: ItemCategory,): ItemPowerBudget {
  return ITEM_POWER_BUDGETS[category] ?? ITEM_POWER_BUDGETS[ItemCategory.Other];
}

/** Outcome of a power check. `field` names the budget that was exceeded. */
export type ItemPowerResult =
  | { ok: true }
  | { ok: false; field: string; reason: string };

/** Raised when an item definition or instance exceeds its category budget. */
export class ItemPowerBudgetError extends Error {
  constructor(
    public readonly field: string,
    reason: string,
  ) {
    super(reason,);
    this.name = "ItemPowerBudgetError";
  }
}

/**
 * Parse a persisted `properties.drift` value into a well-formed drift record.
 * @param value
 */
export function parseItemDrift(value: unknown,): ItemDrift {
  if (typeof value !== "object" || value === null || Array.isArray(value,)) {
    return { statMultipliers: {}, battleUses: 0, lastDriftAt: "", };
  }

  const raw = value as Record<string, unknown>;
  const statMultipliers: Record<string, number> = {};
  const rawMultipliers = raw.statMultipliers;
  if (typeof rawMultipliers === "object" && rawMultipliers !== null && !Array.isArray(rawMultipliers,)) {
    for (const [stat, amount,] of Object.entries(rawMultipliers,)) {
      if (typeof amount === "number" && Number.isFinite(amount,)) { statMultipliers[stat] = amount; }
    }
  }

  return {
    statMultipliers,
    battleUses: typeof raw.battleUses === "number" ? raw.battleUses : 0,
    lastDriftAt: typeof raw.lastDriftAt === "string" ? raw.lastDriftAt : "",
  };
}

/**
 * Sum of `stat_delta` magnitudes across an item's effects.
 * @param effects
 */
export function statDeltaTotal(effects: ItemEffect[],): number {
  let total = 0;
  for (const effect of effects) {
    if (effect.kind === "stat_delta") { total += Math.abs(effect.amount,); }
  }

  return total;
}

/**
 * Sum of absolute drift multipliers carried by an instance.
 * @param drift
 */
export function driftTotal(drift: ItemDrift,): number {
  let total = 0;
  for (const amount of Object.values(drift.statMultipliers,)) { total += Math.abs(amount,); }
  return total;
}

/**
 * Validate an item against its category power budget. Budgets are checked in a
 * fixed order (statDelta, effectCount, maxDurability, drift) so `field` is
 * deterministic when several budgets are exceeded.
 * @param {ItemDefinition} definition
 * @param {ItemInstance} [instance] - Live instance; omit for drafts, where
 *   durability and drift are not yet known.
 * @returns {ItemPowerResult}
 * @throws {Error} when the definition carries malformed effects
 */
export function validateItemPower(
  definition: ItemDefinition,
  instance?: ItemInstance,
): ItemPowerResult {
  const budget = powerBudgetFor(definition.category,);
  const effects = parseItemEffects(definition.properties.effects,);
  const statDelta = statDeltaTotal(effects,);
  if (statDelta > budget.maxStatDelta) {
    return { ok: false, field: "statDelta", reason: `statDelta ${statDelta} exceeds ${budget.maxStatDelta}`, };
  }

  if (effects.length > budget.maxEffectCount) {
    return {
      ok: false,
      field: "effectCount",
      reason: `effectCount ${effects.length} exceeds ${budget.maxEffectCount}`,
    };
  }

  if (!instance) { return { ok: true, }; }
  const maxDurability = instance.maxDurability ?? 0;
  if (maxDurability > budget.maxDurability) {
    return {
      ok: false,
      field: "maxDurability",
      reason: `maxDurability ${maxDurability} exceeds ${budget.maxDurability}`,
    };
  }

  const drift = parseItemDrift(instance.properties.drift,);
  for (const [stat, amount,] of Object.entries(drift.statMultipliers,)) {
    if (Math.abs(amount,) > budget.maxDriftPct) {
      return { ok: false, field: "drift", reason: `drift.${stat} ${amount} exceeds ${budget.maxDriftPct}`, };
    }
  }

  return { ok: true, };
}

/** One row of the admin power audit. */
export interface ItemPowerScore {
  worldItemId: string;
  itemId: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  maxStatDelta: number;
  drift: number;
  maxDurability: number;
  score: number;
}

/**
 * Rank instances by `maxStatDelta + sum(drift) + maxDurability`, strongest
 * first. Ties break on `worldItemId` so the ordering is stable across calls.
 * Instances whose `itemId` is absent from the map are skipped.
 * @param {ReadonlyMap<string, ItemDefinition>} definitionById - keyed by item id
 * @param {ItemInstance[]} instances
 * @returns {ItemPowerScore[]}
 */
export function rankItemPower(
  definitionById: ReadonlyMap<string, ItemDefinition>,
  instances: ItemInstance[],
): ItemPowerScore[] {
  const scored: ItemPowerScore[] = [];
  for (const instance of instances) {
    const definition = definitionById.get(instance.itemId,);
    if (!definition) { continue; }
    const maxStatDelta = statDeltaTotal(parseItemEffects(definition.properties.effects,),);
    const drift = driftTotal(parseItemDrift(instance.properties.drift,),);
    const maxDurability = instance.maxDurability ?? 0;
    scored.push({
      worldItemId: instance.worldItemId,
      itemId: instance.itemId,
      name: instance.name,
      category: definition.category,
      rarity: definition.rarity,
      maxStatDelta,
      drift,
      maxDurability,
      score: maxStatDelta + drift + maxDurability,
    },);
  }

  scored.sort((a, b,) => (b.score - a.score) || a.worldItemId.localeCompare(b.worldItemId,));
  return scored;
}
