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
import { OfferService, } from "./lifecycle";
import { buyFromNpc, sellToNpc, } from "./npc";
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

/** Facade over split trade modules; offer lifecycle inherited. */
export class TradeService extends OfferService {
  /**
   * @param db
   */
  constructor(db: Kysely<DB>,) {
    super(db,);
  }

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
}
