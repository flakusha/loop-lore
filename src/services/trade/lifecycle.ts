// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 230

/**
 * Trade offer facade — pending offer lifecycle over `./offers` + `./counter`.
 *
 * Base class for `TradeService` (see `./index`); split for the size gate.
 * Public API is unchanged — callers keep using `TradeService`.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { tradeCore, } from "./core";
import {
  counterOffer as counterOfferFn,
  listOffers as listOffersFn,
} from "./counter";
import {
  cancelOffer as cancelOfferFn,
  createOffer as createOfferFn,
  loadOfferForAccept,
  markOfferStatus,
  TRADE_RECIPE_SENTINEL,
} from "./offers";
import type { TradeLine, TradeResult, } from "./types";

/** Pending-offer lifecycle: create, accept, counter, cancel, list. */
export class OfferService {
  /**
   * @param db
   */
  constructor(protected readonly db: Kysely<DB>,) {}

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
   * Accept a pending trade offer. A `pending` offer is accepted by the seller;
   * a `countered` offer is accepted by the buyer. Expired deadlines reject.
   * @param offerId
   * @param acceptorActorId
   */
  async acceptOffer(
    offerId: string,
    acceptorActorId: string,
  ): Promise<TradeResult> {
    const loaded = await loadOfferForAccept(this.db, offerId, acceptorActorId,);
    if ("success" in loaded && !loaded.success) { return loaded; }

    const { offer, buyerItems, sellerItems, } = loaded as {
      offer: { world_id: string; requester_actor_id: string; crafter_actor_id: string | null; offered_payment: number };
      buyerItems: TradeLine[];
      sellerItems: TradeLine[];
    };

    const result = await tradeCore(this.db, {
      worldId: offer.world_id,
      buyerActorId: offer.requester_actor_id,
      sellerActorId: offer.crafter_actor_id!,
      buyerItems,
      sellerItems,
      price: offer.offered_payment,
    },);

    await markOfferStatus(this.db, offerId, result.success,);
    return result;
  }

  /**
   * Counter a pending trade offer with revised terms. Either participant may
   * counter while the offer is open; the seller's counter moves it to
   * `countered` (buyer accepts next), the buyer's amendment returns it to
   * `pending` (seller accepts next).
   * @param opts
   * @param opts.offerId
   * @param opts.counterActorId
   * @param opts.buyerItems
   * @param opts.sellerItems
   * @param opts.price
   */
  counterOffer(opts: {
    offerId: string;
    counterActorId: string;
    buyerItems?: TradeLine[];
    sellerItems?: TradeLine[];
    price?: number;
  },): Promise<{ success: boolean; reason?: string }> {
    return counterOfferFn(this.db, opts,);
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
    sellerItems: TradeLine[];
    status: string;
    deadline: string | null;
    createdAt: string;
  }[]> {
    return listOffersFn(this.db, worldId, actorId,);
  }
}
