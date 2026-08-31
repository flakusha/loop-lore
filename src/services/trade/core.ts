// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Core trade execution — atomic two-sided item + currency exchange.
 *
 * All writes are transactional. Currency balances are DENORMALIZED integers
 * in `actor_currencies.balance` (never negative, CHECK-constrained).
 */
import type { Kysely, Transaction, } from "kysely";
import type { DB, } from "../../db/schema";
import { ItemsService, } from "../../story/items";
import { jsonParseOr, jsonStringifyOr, uid, } from "../../utils";
import { credit, debit, } from "./balance";
import { DEFAULT_CURRENCY, } from "./types";
import type { TradeHistoryEntry, TradeLine, TradeResult, TradeType, } from "./types";

/**
 * Execute a two-sided trade atomically between two actors:
 *   buyer pays `price` gold + `buyerItems` → seller
 *   seller sends `sellerItems` → buyer
 *
 * Every item line must be owned by the stated party and hold sufficient
 * quantity. Item transfers and currency ledger commit in one transaction.
 * @param db
 * @param opts
 * @param opts.worldId
 * @param opts.buyerActorId
 * @param opts.sellerActorId
 * @param opts.buyerItems
 * @param opts.sellerItems
 * @param opts.price
 */
export async function tradeCore(
  db: Kysely<DB>,
  opts: {
    worldId: string;
    buyerActorId: string;
    sellerActorId: string;
    buyerItems: TradeLine[];
    sellerItems: TradeLine[];
    price: number;
  },
): Promise<TradeResult> {
  const { worldId, buyerActorId, sellerActorId, buyerItems, sellerItems, price, } = opts;
  if (buyerActorId === sellerActorId) {
    return { success: false, reason: "cannot trade with yourself", };
  }

  const items = new ItemsService(db,);

  const validateLines = async (trx: Kysely<DB>, actorId: string, lines: TradeLine[],): Promise<string | null> => {
    for (const line of lines) {
      const row = await trx
        .selectFrom("world_items",)
        .select(["owner_actor_id", "quantity",],)
        .where("id", "=", line.worldItemId,)
        .executeTakeFirst();
      if (!row) { return `item ${line.worldItemId} not found`; }
      if (row.owner_actor_id !== actorId) { return `item ${line.worldItemId} not owned by intended party`; }
      if (row.quantity < line.quantity) { return `insufficient quantity for ${line.worldItemId}`; }
    }
    return null;
  };

  const preErr = (await validateLines(db, buyerActorId, buyerItems,)) ??
    (await validateLines(db, sellerActorId, sellerItems,));
  if (preErr) { return { success: false, reason: preErr, }; }

  let success = false;
  const moved: { pricePaid: number; itemsOffered: string[]; itemsRequested: string[] } = {
    pricePaid: 0,
    itemsOffered: [],
    itemsRequested: [],
  };
  let reason: string | undefined;

  await db.transaction().execute(async (trx,) => {
    const paid = await debit(trx, buyerActorId, worldId, price, DEFAULT_CURRENCY, trx,);
    if (!paid) {
      reason = "buyer has insufficient currency";
      return;
    }
    await credit(trx, sellerActorId, worldId, price, DEFAULT_CURRENCY, trx,);
    moved.pricePaid = price;

    for (const line of buyerItems) {
      const res = await items.transfer(line.worldItemId, worldId, line.quantity, undefined, sellerActorId, trx,);
      if (!res.success) {
        reason = "buyer item transfer failed";
        return;
      }
      moved.itemsOffered.push(line.worldItemId,);
    }
    for (const line of sellerItems) {
      const res = await items.transfer(line.worldItemId, worldId, line.quantity, undefined, buyerActorId, trx,);
      if (!res.success) {
        reason = "seller item transfer failed";
        return;
      }
      moved.itemsRequested.push(line.worldItemId,);
    }
    success = true;

    if (success) {
      await recordTrade(trx, {
        worldId,
        buyerActorId,
        sellerActorId,
        price,
        currency: DEFAULT_CURRENCY,
        itemsOffered: moved.itemsOffered,
        itemsRequested: moved.itemsRequested,
        tradeType: "player_player",
        trx,
      },);
    }
  },);

  return success ? { success: true, ...moved, } : { success: false, reason, };
}

/**
 * Record a completed trade in trade_history.
 * Called internally after successful trades.
 * @param db
 * @param opts
 * @param opts.worldId
 * @param opts.buyerActorId
 * @param opts.sellerActorId
 * @param opts.price
 * @param opts.currency
 * @param opts.itemsOffered
 * @param opts.itemsRequested
 * @param opts.tradeType
 * @param opts.trx
 */
export async function recordTrade(
  db: Kysely<DB>,
  opts: {
    worldId: string;
    buyerActorId: string;
    sellerActorId: string;
    price: number;
    currency: string;
    itemsOffered: string[];
    itemsRequested: string[];
    tradeType: TradeType;
    trx?: Kysely<DB> | Transaction<DB>;
  },
): Promise<void> {
  const d = opts.trx ?? db;
  await d
    .insertInto("trade_history",)
    .values({
      id: uid(),
      world_id: opts.worldId,
      buyer_actor_id: opts.buyerActorId,
      seller_actor_id: opts.sellerActorId,
      price: opts.price,
      currency_type: opts.currency,
      items_offered: jsonStringifyOr(opts.itemsOffered, "[]",),
      items_requested: jsonStringifyOr(opts.itemsRequested, "[]",),
      trade_type: opts.tradeType,
      created_at: new Date().toISOString(),
    },)
    .execute();
}

/**
 * Query trade history for an actor (as buyer or seller) in a world.
 * Returns most recent trades first.
 * @param db
 * @param worldId
 * @param actorId
 * @param limit
 */
export async function getTradeHistory(
  db: Kysely<DB>,
  worldId: string,
  actorId?: string,
  limit = 50,
): Promise<TradeHistoryEntry[]> {
  let query = db
    .selectFrom("trade_history",)
    .where("world_id", "=", worldId,)
    .orderBy("created_at", "desc",)
    .limit(limit,);

  if (actorId) {
    query = query.where((eb,) =>
      eb.or([
        eb("buyer_actor_id", "=", actorId,),
        eb("seller_actor_id", "=", actorId,),
      ],)
    );
  }

  const rows = await query.selectAll().execute();
  return Array.from(rows, (r,) => ({
    id: r.id,
    worldId: r.world_id,
    buyerActorId: r.buyer_actor_id,
    sellerActorId: r.seller_actor_id,
    price: r.price,
    currencyType: r.currency_type,
    itemsOffered: jsonParseOr(r.items_offered, [] as string[],),
    itemsRequested: jsonParseOr(r.items_requested, [] as string[],),
    tradeType: r.trade_type as TradeType,
    createdAt: r.created_at,
  }),);
}
