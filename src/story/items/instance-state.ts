// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** World-item durability, drift, and unique lookup. */
import type { Transaction, } from "kysely";
import { ItemRarity, StackableState, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import type { DurabilityResult, ItemDrift, ItemDriftEvent, ItemState, } from "./types";

const DRIFT_CAPS: Record<ItemRarity, number> = {
  [ItemRarity.Common]: 0.05,
  [ItemRarity.Uncommon]: 0.1,
  [ItemRarity.Rare]: 0.15,
  [ItemRarity.Epic]: 0.2,
  [ItemRarity.Legendary]: 0.3,
  [ItemRarity.Unique]: Number.POSITIVE_INFINITY,
  [ItemRarity.Artifact]: Number.POSITIVE_INFINITY,
};

function driftFrom(properties: string,): ItemDrift {
  const value = jsonParseOr<Record<string, unknown>>(properties, {},).drift;
  if (typeof value !== "object" || value === null || Array.isArray(value,)) {
    return { statMultipliers: {}, battleUses: 0, lastDriftAt: "", };
  }
  const rawDrift = value as Record<string, unknown>;
  const rawMultipliers = rawDrift.statMultipliers;
  const statMultipliers: Record<string, number> = {};
  if (typeof rawMultipliers === "object" && rawMultipliers !== null && !Array.isArray(rawMultipliers,)) {
    for (const [stat, amount,] of Object.entries(rawMultipliers,)) {
      if (typeof amount === "number" && Number.isFinite(amount,)) { statMultipliers[stat] = amount; }
    }
  }
  const rawBattleUses = rawDrift.battleUses;
  const battleUses = typeof rawBattleUses === "number" ? rawBattleUses : 0;
  const rawLastDriftAt = rawDrift.lastDriftAt;
  const lastDriftAt = typeof rawLastDriftAt === "string" ? rawLastDriftAt : "";
  return { statMultipliers, battleUses, lastDriftAt, };
}

function encodeProperties(properties: Record<string, unknown>,): string {
  const result = safeJsonStringify(properties,);
  return result.ok ? result.value : "{}";
}

/** Apply durability wear and mark broken instances inactive. */
export async function decrementDurability(
  state: ItemState,
  worldItemId: string,
  worldId: string,
  amount: number,
  trx?: Transaction<DB>,
): Promise<DurabilityResult> {
  const db = trx ?? state.db;
  const row = await db
    .selectFrom("world_items",)
    .select(["current_durability", "max_durability",],)
    .where("id", "=", worldItemId,)
    .where("world_id", "=", worldId,)
    .executeTakeFirst();
  if (!row) { return { remaining: null, broken: true, }; }
  if (row.current_durability === null || !Number.isFinite(amount,) || amount <= 0) {
    return { remaining: row.current_durability, broken: false, };
  }
  const remaining = Math.max(0, row.current_durability - amount,);
  await db
    .updateTable("world_items",)
    .set({ current_durability: remaining, is_active: remaining === 0 ? 0 : 1, },)
    .where("id", "=", worldItemId,)
    .where("world_id", "=", worldId,)
    .execute();
  return { remaining, broken: remaining === 0, };
}

/** Apply a capped stat drift event to a world-item instance. */
export async function applyDrift(
  state: ItemState,
  worldItemId: string,
  worldId: string,
  event: ItemDriftEvent,
  trx?: Transaction<DB>,
): Promise<ItemDrift | null> {
  if (typeof event.stat !== "string" || event.stat.trim().length === 0 || !Number.isFinite(event.amount,)) {
    return null;
  }
  const db = trx ?? state.db;
  const row = await db
    .selectFrom("world_items",)
    .innerJoin("items", "items.id", "world_items.item_id",)
    .select(["world_items.properties", "items.rarity",],)
    .where("world_items.id", "=", worldItemId,)
    .where("world_items.world_id", "=", worldId,)
    .executeTakeFirst();
  if (!row) { return null; }
  const properties = jsonParseOr<Record<string, unknown>>(row.properties, {},);
  const drift = driftFrom(row.properties,);
  const cap = DRIFT_CAPS[row.rarity];
  const previous = drift.statMultipliers[event.stat] ?? 0;
  const next = Math.min(cap, Math.max(-cap, previous + event.amount,),);
  drift.statMultipliers[event.stat] = next;
  drift.battleUses += Math.max(0, event.battleUses ?? 1,);
  drift.lastDriftAt = new Date().toISOString();
  properties.drift = drift;
  await db
    .updateTable("world_items",)
    .set({ properties: encodeProperties(properties,), },)
    .where("id", "=", worldItemId,)
    .where("world_id", "=", worldId,)
    .execute();
  return drift;
}

/** Return the world's single instance of a unique definition, if present. */
export async function getUniqueItem(state: ItemState, itemId: string, worldId: string,) {
  return (
    await state.db
      .selectFrom("world_items",)
      .innerJoin("items", "items.id", "world_items.item_id",)
      .selectAll("world_items",)
      .where("world_items.world_id", "=", worldId,)
      .where("world_items.item_id", "=", itemId,)
      .where("items.world_id", "=", worldId,)
      .where("items.stackable", "=", StackableState.Unique,)
      .where("items.rarity", "in", [ItemRarity.Unique, ItemRarity.Artifact,],)
      .executeTakeFirst()
  ) ?? null;
}
