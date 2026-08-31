// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC trading operations — buy from / sell to NPC actors.
 *
 * Delegates to core `tradeCore` + `recordTrade` for atomicity.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { recordTrade, tradeCore, } from "./core";
import { DEFAULT_CURRENCY, } from "./types";
import type { TradeLine, TradeResult, } from "./types";

/**
 * Player buys items from an NPC. The NPC sells `sellerItems` to the buyer
 * for `price` gold. Items must be owned by the NPC.
 * @param db
 * @param opts
 * @param opts.worldId
 * @param opts.buyerActorId
 * @param opts.npcActorId
 * @param opts.sellerItems
 * @param opts.price
 */
export async function buyFromNpc(
  db: Kysely<DB>,
  opts: {
    worldId: string;
    buyerActorId: string;
    npcActorId: string;
    sellerItems: TradeLine[];
    price: number;
  },
): Promise<TradeResult> {
  const { worldId, buyerActorId, npcActorId, sellerItems, price, } = opts;
  if (buyerActorId === npcActorId) {
    return { success: false, reason: "cannot trade with yourself", };
  }

  const result = await tradeCore(db, {
    worldId,
    buyerActorId,
    sellerActorId: npcActorId,
    buyerItems: [],
    sellerItems,
    price,
  },);

  if (result.success) {
    await recordTrade(db, {
      worldId,
      buyerActorId,
      sellerActorId: npcActorId,
      price,
      currency: DEFAULT_CURRENCY,
      itemsOffered: [],
      itemsRequested: result.itemsRequested ?? [],
      tradeType: "player_npc",
    },);
  }

  return result;
}

/**
 * Player sells items to an NPC. The NPC buys `buyerItems` from the seller
 * for `price` gold. Items must be owned by the player.
 * @param db
 * @param opts
 * @param opts.worldId
 * @param opts.sellerActorId
 * @param opts.npcActorId
 * @param opts.buyerItems
 * @param opts.price
 */
export async function sellToNpc(
  db: Kysely<DB>,
  opts: {
    worldId: string;
    sellerActorId: string;
    npcActorId: string;
    buyerItems: TradeLine[];
    price: number;
  },
): Promise<TradeResult> {
  const { worldId, sellerActorId, npcActorId, buyerItems, price, } = opts;
  if (sellerActorId === npcActorId) {
    return { success: false, reason: "cannot trade with yourself", };
  }

  const result = await tradeCore(db, {
    worldId,
    buyerActorId: npcActorId,
    sellerActorId,
    buyerItems: [],
    sellerItems: buyerItems,
    price,
  },);

  if (result.success) {
    await recordTrade(db, {
      worldId,
      buyerActorId: npcActorId,
      sellerActorId,
      price,
      currency: DEFAULT_CURRENCY,
      itemsOffered: result.itemsOffered ?? [],
      itemsRequested: [],
      tradeType: "npc_player",
    },);
  }

  return result;
}
