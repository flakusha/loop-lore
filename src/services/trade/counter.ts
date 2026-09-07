// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade counter-offers, expiry, and offer queries.
 *
 * Negotiation layer over the `crafting_orders`-backed offers in `./offers`.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";
import type { TradeLine, } from "./types";

/**
 * True when a deadline timestamp is set and already past.
 * @param deadline
 */
export function isExpired(deadline: string | null,): boolean {
  if (!deadline) { return false; }
  return new Date(deadline,).getTime() < Date.now();
}

/**
 * Mark an offer expired (deadline passed without acceptance).
 * @param db
 * @param offerId
 */
export async function markOfferExpired(
  db: Kysely<DB>,
  offerId: string,
): Promise<void> {
  await db.updateTable("crafting_orders",)
    .set({ status: "expired", updated_at: new Date().toISOString(), },)
    .where("id", "=", offerId,)
    .execute();
}

/**
 * Counter a pending trade offer with revised terms. Either participant may
 * counter while the offer is open: the seller's counter moves the offer to
 * `countered` (awaiting the buyer); the buyer's amendment returns it to
 * `pending` (awaiting the seller). Only the party whose turn it is not may
 * accept — see loadOfferForAccept.
 * @param db
 * @param opts
 * @param opts.offerId
 * @param opts.counterActorId
 * @param opts.buyerItems
 * @param opts.sellerItems
 * @param opts.price
 */
export async function counterOffer(
  db: Kysely<DB>,
  opts: {
    offerId: string;
    counterActorId: string;
    buyerItems?: TradeLine[];
    sellerItems?: TradeLine[];
    price?: number;
  },
): Promise<{ success: boolean; reason?: string }> {
  const offer = await db.selectFrom("crafting_orders",)
    .select([
      "id",
      "status",
      "requester_actor_id",
      "crafter_actor_id",
      "offered_payment",
      "offered_materials",
      "requested_materials",
      "deadline",
    ],)
    .where("id", "=", opts.offerId,)
    .executeTakeFirst();

  if (!offer) { return { success: false, reason: "offer not found", }; }
  if (offer.status !== "pending" && offer.status !== "countered") {
    return { success: false, reason: `offer is ${offer.status}`, };
  }
  if (isExpired(offer.deadline,)) {
    await markOfferExpired(db, opts.offerId,);
    return { success: false, reason: "offer expired", };
  }
  const isSeller = offer.crafter_actor_id === opts.counterActorId;
  const isBuyer = offer.requester_actor_id === opts.counterActorId;
  if (!isSeller && !isBuyer) {
    return { success: false, reason: "only participants can counter", };
  }

  await db.updateTable("crafting_orders",)
    .set({
      offered_materials: opts.buyerItems !== undefined
        ? jsonStringifyOr(opts.buyerItems, "[]",)
        : offer.offered_materials,
      requested_materials: opts.sellerItems !== undefined
        ? jsonStringifyOr(opts.sellerItems, "[]",)
        : offer.requested_materials,
      offered_payment: opts.price ?? offer.offered_payment,
      status: isSeller ? "countered" : "pending",
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", opts.offerId,)
    .execute();

  return { success: true, };
}

/**
 * List pending trade offers for an actor (as buyer or seller).
 * @param db
 * @param worldId
 * @param actorId
 */
export async function listOffers(
  db: Kysely<DB>,
  worldId: string,
  actorId: string,
): Promise<{
  id: string;
  buyerActorId: string;
  sellerActorId: string | null;
  price: number;
  items: TradeLine[];
  sellerItems: TradeLine[];
  status: string;
  deadline: string | null;
  createdAt: string;
}[]> {
  await db.updateTable("crafting_orders",)
    .set({ status: "expired", updated_at: new Date().toISOString(), },)
    .where("world_id", "=", worldId,)
    .where("trade_type", "=", "trade",)
    .where("status", "in", ["pending", "countered",],)
    .where("deadline", "is not", null,)
    .where("deadline", "<", new Date().toISOString(),)
    .execute();

  const rows = await db.selectFrom("crafting_orders",)
    .where("world_id", "=", worldId,)
    .where("trade_type", "=", "trade",)
    .where((eb,) =>
      eb.or([
        eb("requester_actor_id", "=", actorId,),
        eb("crafter_actor_id", "=", actorId,),
      ],)
    )
    .orderBy("created_at", "desc",)
    .selectAll()
    .execute();

  return Array.from(rows, (r,) => ({
    id: r.id,
    buyerActorId: r.requester_actor_id,
    sellerActorId: r.crafter_actor_id,
    price: r.offered_payment,
    items: jsonParseOr(r.offered_materials, [] as TradeLine[],),
    sellerItems: jsonParseOr(r.requested_materials, [] as TradeLine[],),
    status: r.status,
    deadline: r.deadline,
    createdAt: r.created_at,
  }),);
}
