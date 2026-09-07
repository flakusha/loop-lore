// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade offer lifecycle — create, accept, cancel, list.
 *
 * Uses `crafting_orders` with `trade_type = "trade"` and a sentinel `recipe_id`.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, jsonStringifyOr, uid, } from "../../utils";
import { isExpired, markOfferExpired, } from "./counter";
import type { TradeLine, TradeResult, } from "./types";

/** Sentinel recipe_id for trade offers (crafting_orders.recipe_id is NOT NULL). */
export const TRADE_RECIPE_SENTINEL = "__trade_offer__";

/**
 * Ensure the sentinel recipe exists for trade offers.
 * The crafting_orders table has a FK on recipe_id → crafting_recipes.id,
 * so we need a real row to reference for trade offers.
 * @param db
 * @param worldId
 */
export async function ensureTradeSentinel(
  db: Kysely<DB>,
  worldId: string,
): Promise<void> {
  const existing = await db.selectFrom("crafting_recipes",)
    .select("id",)
    .where("id", "=", TRADE_RECIPE_SENTINEL,)
    .executeTakeFirst();
  if (existing) { return; }

  const now = new Date().toISOString();

  // Sentinel item (FK: crafting_recipes.output_item_id → items.id).
  await db.insertInto("items",).values({
    id: TRADE_RECIPE_SENTINEL,
    world_id: worldId,
    name: "__trade_offer__",
    category: "misc",
    description: "Sentinel item for trade offers — do not delete",
    created_at: now,
    updated_at: now,
  },).execute();

  // Sentinel recipe (FK: crafting_orders.recipe_id → crafting_recipes.id).
  await db.insertInto("crafting_recipes",).values({
    id: TRADE_RECIPE_SENTINEL,
    world_id: worldId,
    name: "__trade_offer__",
    description: "Sentinel recipe for trade offers — do not delete",
    discipline: "smithing",
    tier: 0,
    level_required: 0,
    output_item_id: TRADE_RECIPE_SENTINEL,
    output_quantity: 0,
    crafting_time_seconds: 0,
    base_success_chance: 0,
    base_quality_min: 0,
    base_quality_max: 0,
    perfect_threshold: 0,
    discovered_by_default: 0,
    tags: "[]",
    created_at: now,
    updated_at: now,
  },).execute();
}

/**
 * Create a pending trade offer. The offerer proposes to buy items from
 * a counterparty for a price. Returns the offer ID.
 * @param db
 * @param opts
 * @param opts.worldId
 * @param opts.buyerActorId
 * @param opts.sellerActorId
 * @param opts.buyerItems
 * @param opts.price
 * @param opts.deadline
 */
export async function createOffer(
  db: Kysely<DB>,
  opts: {
    worldId: string;
    buyerActorId: string;
    sellerActorId: string;
    buyerItems: TradeLine[];
    price: number;
    deadline?: string;
  },
): Promise<string> {
  await ensureTradeSentinel(db, opts.worldId,);

  const id = uid();
  const now = new Date().toISOString();
  await db.insertInto("crafting_orders",).values({
    id,
    world_id: opts.worldId,
    requester_actor_id: opts.buyerActorId,
    crafter_actor_id: opts.sellerActorId,
    recipe_id: TRADE_RECIPE_SENTINEL,
    quantity: 1,
    offered_payment: opts.price,
    offered_materials: jsonStringifyOr(opts.buyerItems, "[]",),
    requested_materials: "[]",
    status: "pending",
    trade_type: "trade",
    deadline: opts.deadline ?? null,
    created_at: now,
    updated_at: now,
  },).execute();
  return id;
}

/**
 * Accept a pending trade offer. Returns the offer row for the caller to
 * execute the trade with. Only the seller (crafter_actor_id) can accept.
 * @param db
 * @param offerId
 * @param acceptorActorId
 */
export async function loadOfferForAccept(
  db: Kysely<DB>,
  offerId: string,
  acceptorActorId: string,
): Promise<
  | TradeResult
  | {
    offer: {
      world_id: string;
      requester_actor_id: string;
      crafter_actor_id: string | null;
      offered_payment: number;
      offered_materials: string;
      requested_materials: string;
    };
    buyerItems: TradeLine[];
    sellerItems: TradeLine[];
  }
> {
  const offer = await db.selectFrom("crafting_orders",)
    .where("id", "=", offerId,)
    .selectAll()
    .executeTakeFirst();

  if (!offer) { return { success: false, reason: "offer not found", }; }
  if (offer.status === "pending" || offer.status === "countered") {
    if (isExpired(offer.deadline,)) {
      await markOfferExpired(db, offerId,);
      return { success: false, reason: "offer expired", };
    }
  } else {
    return { success: false, reason: `offer is ${offer.status}`, };
  }
  if (offer.status === "pending" && offer.crafter_actor_id !== acceptorActorId) {
    return { success: false, reason: "only the seller can accept", };
  }
  if (offer.status === "countered" && offer.requester_actor_id !== acceptorActorId) {
    return { success: false, reason: "only the buyer can accept a countered offer", };
  }

  const buyerItems: TradeLine[] = jsonParseOr(offer.offered_materials, [] as TradeLine[],);
  const sellerItems: TradeLine[] = jsonParseOr(offer.requested_materials, [] as TradeLine[],);
  return { offer, buyerItems, sellerItems, };
}

/**
 * Mark an offer as accepted or failed.
 * @param db
 * @param offerId
 * @param success
 */
export async function markOfferStatus(
  db: Kysely<DB>,
  offerId: string,
  success: boolean,
): Promise<void> {
  await db.updateTable("crafting_orders",)
    .set({ status: success ? "accepted" : "failed", updated_at: new Date().toISOString(), },)
    .where("id", "=", offerId,)
    .execute();
}

/**
 * Cancel a pending trade offer. Only the offer creator (requester_actor_id) can cancel.
 * @param db
 * @param offerId
 * @param cancellerActorId
 */
export async function cancelOffer(
  db: Kysely<DB>,
  offerId: string,
  cancellerActorId: string,
): Promise<{ success: boolean; reason?: string }> {
  const offer = await db.selectFrom("crafting_orders",)
    .select(["id", "status", "requester_actor_id",],)
    .where("id", "=", offerId,)
    .executeTakeFirst();

  if (!offer) { return { success: false, reason: "offer not found", }; }
  if (offer.status !== "pending" && offer.status !== "countered") {
    return { success: false, reason: `offer is ${offer.status}`, };
  }
  if (offer.requester_actor_id !== cancellerActorId) {
    return { success: false, reason: "only the offer creator can cancel", };
  }

  await db.updateTable("crafting_orders",)
    .set({ status: "cancelled", updated_at: new Date().toISOString(), },)
    .where("id", "=", offerId,)
    .execute();

  return { success: true, };
}
