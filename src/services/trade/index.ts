// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 281

/**
 * Trade Service — facade over split trade modules.
 *
 * Player↔player and player↔NPC trading with gold/currency exchange,
 * layered over `ItemsService` for item transfer and an `actor_currencies`
 * balance ledger per world.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  credit,
  debit,
  getBalance,
  transferCurrency,
} from "./balance";
import {
  getTradeHistory,
  tradeCore,
} from "./core";
import { buyFromNpc, sellToNpc, } from "./npc";
import {
  cancelOffer as cancelOfferFn,
  createOffer as createOfferFn,
  listOffers as listOffersFn,
  loadOfferForAccept,
  markOfferStatus,
  TRADE_RECIPE_SENTINEL,
} from "./offers";
import { DEFAULT_CURRENCY, } from "./types";
import type { TradeHistoryEntry, TradeLine, TradeResult, } from "./types";

export { DEFAULT_CURRENCY, } from "./types";
export type {
  TradeHistoryEntry,
  TradeLine,
  TradeOffer,
  TradeResult,
  TradeType,
} from "./types";

/** */
export class TradeService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Current gold (or other currency) balance for an actor in a world.
   * @param actorId
   * @param worldId
   * @param currency
   */
  getBalance(
    actorId: string,
    worldId: string,
    currency: string = DEFAULT_CURRENCY,
  ): Promise<number> {
    return getBalance(this.db, actorId, worldId, currency,);
  }

  /**
   * Add funds to an actor's balance (never produces a negative balance).
   * @param actorId
   * @param worldId
   * @param amount
   * @param currency
   */
  credit(
    actorId: string,
    worldId: string,
    amount: number,
    currency: string = DEFAULT_CURRENCY,
  ): Promise<number> {
    return credit(this.db, actorId, worldId, amount, currency,);
  }

  /**
   * Remove funds; returns false (no-op) when insufficient.
   * @param actorId
   * @param worldId
   * @param amount
   * @param currency
   */
  debit(
    actorId: string,
    worldId: string,
    amount: number,
    currency: string = DEFAULT_CURRENCY,
  ): Promise<boolean> {
    return debit(this.db, actorId, worldId, amount, currency,);
  }

  /**
   * Move gold atomically from one actor to another.
   * @param fromActorId
   * @param toActorId
   * @param worldId
   * @param amount
   * @param currency
   */
  transferCurrency(
    fromActorId: string,
    toActorId: string,
    worldId: string,
    amount: number,
    currency: string = DEFAULT_CURRENCY,
  ): Promise<boolean> {
    return transferCurrency(this.db, fromActorId, toActorId, worldId, amount, currency,);
  }

  /**
   * Execute a two-sided trade atomically.
   * @param opts
   * @param opts.worldId
   * @param opts.buyerActorId
   * @param opts.sellerActorId
   * @param opts.buyerItems
   * @param opts.sellerItems
   * @param opts.price
   */
  trade(opts: {
    worldId: string;
    buyerActorId: string;
    sellerActorId: string;
    buyerItems: TradeLine[];
    sellerItems: TradeLine[];
    price: number;
  },): Promise<TradeResult> {
    return tradeCore(this.db, opts,);
  }

  /**
   * Query trade history for an actor in a world.
   * @param worldId
   * @param actorId
   * @param limit
   */
  getTradeHistory(
    worldId: string,
    actorId?: string,
    limit = 50,
  ): Promise<TradeHistoryEntry[]> {
    return getTradeHistory(this.db, worldId, actorId, limit,);
  }

  /**
   * Player buys items from an NPC.
   * @param opts
   * @param opts.worldId
   * @param opts.buyerActorId
   * @param opts.npcActorId
   * @param opts.sellerItems
   * @param opts.price
   */
  buyFromNpc(opts: {
    worldId: string;
    buyerActorId: string;
    npcActorId: string;
    sellerItems: TradeLine[];
    price: number;
  },): Promise<TradeResult> {
    return buyFromNpc(this.db, opts,);
  }

  /**
   * Player sells items to an NPC.
   * @param opts
   * @param opts.worldId
   * @param opts.sellerActorId
   * @param opts.npcActorId
   * @param opts.buyerItems
   * @param opts.price
   */
  sellToNpc(opts: {
    worldId: string;
    sellerActorId: string;
    npcActorId: string;
    buyerItems: TradeLine[];
    price: number;
  },): Promise<TradeResult> {
    return sellToNpc(this.db, opts,);
  }

  // ── Trade Offer Lifecycle ─────────────────────────────

  static readonly TRADE_RECIPE_SENTINEL = TRADE_RECIPE_SENTINEL;

  /**
   * Create a pending trade offer. Returns the offer ID.
   * @param opts
   * @param opts.worldId
   * @param opts.buyerActorId
   * @param opts.sellerActorId
   * @param opts.buyerItems
   * @param opts.price
   * @param opts.deadline
   */
  createOffer(opts: {
    worldId: string;
    buyerActorId: string;
    sellerActorId: string;
    buyerItems: TradeLine[];
    price: number;
    deadline?: string;
  },): Promise<string> {
    return createOfferFn(this.db, opts,);
  }

  /**
   * Accept a pending trade offer. Only the seller can accept.
   * @param offerId
   * @param acceptorActorId
   */
  async acceptOffer(
    offerId: string,
    acceptorActorId: string,
  ): Promise<TradeResult> {
    const loaded = await loadOfferForAccept(this.db, offerId, acceptorActorId,);
    if ("success" in loaded && !loaded.success) { return loaded; }

    const { offer, buyerItems, } = loaded as {
      offer: { world_id: string; requester_actor_id: string; crafter_actor_id: string | null; offered_payment: number };
      buyerItems: TradeLine[];
    };

    const result = await tradeCore(this.db, {
      worldId: offer.world_id,
      buyerActorId: offer.requester_actor_id,
      sellerActorId: offer.crafter_actor_id!,
      buyerItems,
      sellerItems: [],
      price: offer.offered_payment,
    },);

    await markOfferStatus(this.db, offerId, result.success,);
    return result;
  }

  /**
   * Cancel a pending trade offer. Only the offer creator can cancel.
   * @param offerId
   * @param cancellerActorId
   */
  cancelOffer(
    offerId: string,
    cancellerActorId: string,
  ): Promise<{ success: boolean; reason?: string }> {
    return cancelOfferFn(this.db, offerId, cancellerActorId,);
  }

  /**
   * List pending trade offers for an actor.
   * @param worldId
   * @param actorId
   */
  listOffers(
    worldId: string,
    actorId: string,
  ): Promise<{
    id: string;
    buyerActorId: string;
    sellerActorId: string | null;
    price: number;
    items: TradeLine[];
    status: string;
    deadline: string | null;
    createdAt: string;
  }[]> {
    return listOffersFn(this.db, worldId, actorId,);
  }
}
