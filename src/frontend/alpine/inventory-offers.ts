// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 360
// One Alpine scope for the offers surface: my-items loader, offer poll, five
// mutations, history loader, confirm gating (mirrors inventory-trading.ts).

// ── Player-to-player trade offers (Phase 4).
// Drives:
//   GET    /api/v1/worlds/:worldId/item-instances             (my draft rows; owner_actor_id filter is client-side)
//   GET    /api/v1/worlds/:worldId/items?pageSize=100         (definitions: name + value)
//   POST   /api/v1/worlds/:worldId/trade/offers               { buyerActorId, sellerActorId, buyerItems, price }
//   GET    /api/v1/worlds/:worldId/trade/offers?actorId=      (poll on load + after every mutation)
//   POST   /api/v1/worlds/:worldId/trade/offers/:offerId/accept  { actorId }
//   POST   /api/v1/worlds/:worldId/trade/offers/:offerId/counter { counterActorId, buyerItems?, sellerItems?, price? }
//   POST   /api/v1/worlds/:worldId/trade/offers/:offerId/cancel  { buyerActorId }
//   GET    /api/v1/worlds/:worldId/trade/history?actorId=&limit= (past trades, newest-first)
// The buyer proposes their items + price (sellerItems in the create body is
// silently dropped server-side); the seller adds their items via counter.
// The counterparty's inventory is never fetched — only their offered lines.
// No push channel exists for offers, so the scope re-polls after mutations.
import type { InventoryItem, } from "../inventory/inventory-grid.js";
import {
  canAccept,
  canCancel,
  canCounter,
  draftHasNoTerms,
  type TradeHistoryRow,
  type TradeOfferRow,
} from "../inventory/trade-offers.js";
import {
  emptyDraft,
  enrichInstances,
  historyFromBody,
  offersFromBody,
  ownedBy,
  priceOrUnset,
  routeErrorMessage,
  rowsFromBody,
  rowsValue,
  selectedRows,
  toggleId,
  type TradeDraft,
  type TradeLine,
  tradeLines,
} from "../inventory/trade-panel.js";
import { apiFetch, } from "./htmx.js";
import { t, } from "./i18n.js";
import { jsonBody, } from "./json.js";
import { log as rootLog, } from "./logger.js";

const log = rootLog.child({ module: "inventory-offers", },);

/** Alpine scope for the player-to-player offers panel. */
export interface InventoryOffersState {
  _worldId: string | null;
  _myActorId: string | null;
  counterpartyId: string;
  myItems: InventoryItem[];
  myLoading: boolean;
  myLoadError: string;
  offers: TradeOfferRow[];
  offersLoading: boolean;
  offersError: string;
  selectedOfferId: string | null;
  confirmingAcceptId: string | null;
  counterPrice: number | null;
  offerPrice: number | null;
  draft: TradeDraft;
  history: TradeHistoryRow[];
  historyLoading: boolean;
  historyError: string;
  busy: boolean;
  message: string;
  error: string;
  /** Point the panel at a world/actor pair; clears lists, draft, selection. */
  setOfferActors(worldId: string, myActorId: string,): void;
  /** Toggle one owned row in the create/counter draft. */
  toggleMine(itemId: string,): void;
  /** Clear the draft selection. */
  clearDraft(): void;
  /** Reload my items + offers (poll entry point). */
  load(): Promise<void>;
  /** Reload my world-item instances for the draft picker. */
  loadMyItems(): Promise<void>;
  /** Re-poll GET offers for my actor. */
  loadOffers(): Promise<void>;
  /** Reload newest-first history for my actor. */
  loadHistory(): Promise<void>;
  /** Create a pending offer: my draft lines + price to the counterparty. */
  createOffer(): Promise<void>;
  /** Accept the selected offer; first call arms the confirm step. */
  acceptOffer(offerId: string,): Promise<void>;
  /** Counter with my draft lines + counterPrice. */
  counterOffer(offerId: string,): Promise<void>;
  /** Cancel an offer I created. */
  cancelOffer(offerId: string,): Promise<void>;
  /** Whether the selected offer accepts action `kind` for the current actor. */
  canActSelected(kind: "accept" | "cancel" | "counter",): boolean;
  /** Offer backing the open trade window, if any. */
  selectedOffer(): TradeOfferRow | null;
}

/** Surface a route error body: server `{ error }` first, legacy `{ message }` next. */
async function routeError(res: Response, fallback: string,): Promise<string> {
  return routeErrorMessage(await res.json().catch(() => ({})), fallback,);
}

/** Build a state with defaults; no auto-load so tests skip the side effect. */
export const stateFromOfferActors = (
  worldId: string | null = null,
  myActorId: string | null = null,
): InventoryOffersState => ({
  _worldId: worldId,
  _myActorId: myActorId,
  counterpartyId: "",
  myItems: [],
  myLoading: false,
  myLoadError: "",
  offers: [],
  offersLoading: false,
  offersError: "",
  selectedOfferId: null,
  confirmingAcceptId: null,
  counterPrice: 0,
  offerPrice: 0,
  draft: emptyDraft(),
  history: [],
  historyLoading: false,
  historyError: "",
  busy: false,
  message: "",
  error: "",

  setOfferActors(worldId: string, myActorId: string,) {
    this._worldId = worldId;
    this._myActorId = myActorId;
    this.counterpartyId = "";
    this.myItems = [];
    this.offers = [];
    this.selectedOfferId = null;
    this.confirmingAcceptId = null;
    this.history = [];
    this.draft = emptyDraft();
    this.myLoadError = "";
    this.offersError = "";
    this.historyError = "";
    this.message = "";
    this.error = "";
  },

  toggleMine(itemId: string,) {
    if (!this.myItems.some((item,) => item.id === itemId)) { return; }
    this.draft = { ...this.draft, playerIds: toggleId(this.draft.playerIds, itemId,), };
  },

  clearDraft() {
    this.draft = emptyDraft();
  },

  async load() {
    await this.loadMyItems();
    await this.loadOffers();
  },

  async loadMyItems() {
    const worldId = this._worldId;
    const actorId = this._myActorId;
    if (!worldId || !actorId) { return; }
    this.myLoading = true;
    this.myLoadError = "";
    try {
      const instRes = await apiFetch(`/api/v1/worlds/${worldId}/item-instances`,);
      const defRes = await apiFetch(`/api/v1/worlds/${worldId}/items?pageSize=100`,);
      if (!instRes.ok || !defRes.ok) {
        this.myLoadError = t("status.inventoryLoadFailed",);
        return;
      }

      this.myItems = enrichInstances(
        ownedBy(await instRes.json(), actorId,),
        rowsFromBody(await defRes.json(),),
      );

      this.draft = {
        playerIds: this.draft.playerIds.filter((id,) => this.myItems.some((item,) => item.id === id)),
        npcIds: [],
      };
    } catch (error) {
      log.error("Failed to load offer draft items", error instanceof Error ? error : undefined, { actorId, },);
      this.myLoadError = t("status.inventoryLoadFailed",);
    } finally {
      this.myLoading = false;
    }
  },

  async loadOffers() {
    const worldId = this._worldId;
    const actorId = this._myActorId;
    if (!worldId || !actorId) { return; }
    this.offersLoading = true;
    this.offersError = "";
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}/trade/offers?actorId=${encodeURIComponent(actorId,)}`,);
      if (!res.ok) {
        this.offersError = await routeError(res, t("status.tradeOffersLoadFailed",),);
        return;
      }

      this.offers = offersFromBody(await res.json(),);
      if (this.selectedOfferId !== null && !this.offers.some((offer,) => offer.id === this.selectedOfferId)) {
        this.selectedOfferId = null;
        this.confirmingAcceptId = null;
      }
    } catch (error) {
      log.error("Failed to load trade offers", error instanceof Error ? error : undefined, { actorId, },);
      this.offersError = t("status.tradeOffersLoadFailed",);
    } finally {
      this.offersLoading = false;
    }
  },

  async loadHistory() {
    const worldId = this._worldId;
    const actorId = this._myActorId;
    if (!worldId || !actorId) { return; }
    this.historyLoading = true;
    this.historyError = "";
    try {
      const res = await apiFetch(
        `/api/v1/worlds/${worldId}/trade/history?actorId=${encodeURIComponent(actorId,)}&limit=20`,
      );

      if (!res.ok) {
        this.historyError = await routeError(res, t("status.tradeHistoryLoadFailed",),);
        return;
      }

      this.history = historyFromBody(await res.json(),);
    } catch (error) {
      log.error("Failed to load trade history", error instanceof Error ? error : undefined, { actorId, },);
      this.historyError = t("status.tradeHistoryLoadFailed",);
    } finally {
      this.historyLoading = false;
    }
  },

  async createOffer() {
    const worldId = this._worldId;
    const myActorId = this._myActorId;
    const sellerId = this.counterpartyId.trim();
    if (!worldId || !myActorId || !sellerId || this.busy) { return; }
    const rows = selectedRows(this.myItems, this.draft.playerIds,);
    if (draftHasNoTerms(this.offerPrice, rows.length,)) {
      this.error = t("status.tradeOfferEmptyDraft",);
      return;
    }

    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}/trade/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          buyerActorId: myActorId,
          sellerActorId: sellerId,
          buyerItems: tradeLines(rows,),
          price: priceOrUnset(this.offerPrice,) ?? rowsValue(rows,),
        },),
      },);

      if (!res.ok) {
        this.error = await routeError(res, t("status.tradeOfferCreateFailed",),);
        return;
      }

      this.draft = emptyDraft();
      this.message = t("status.tradeOfferCreated",);
      await this.loadOffers();
    } catch (error) {
      log.error("Trade offer create failed", error instanceof Error ? error : undefined, { worldId, },);
      this.error = t("status.tradeOfferCreateFailed",);
    } finally {
      this.busy = false;
    }
  },

  async acceptOffer(offerId: string,) {
    const worldId = this._worldId;
    const myActorId = this._myActorId;
    if (!worldId || !myActorId || this.busy) { return; }
    if (this.confirmingAcceptId !== offerId) {
      this.confirmingAcceptId = offerId;
      return;
    }

    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}/trade/offers/${offerId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ actorId: myActorId, },),
      },);

      if (!res.ok) {
        this.error = await routeError(res, t("status.tradeFailed",),);
        return;
      }

      this.confirmingAcceptId = null;
      this.selectedOfferId = null;
      this.message = t("status.tradeConfirmed",);
      await this.loadOffers();
      await this.loadMyItems();
      await this.loadHistory();
    } catch (error) {
      log.error("Trade offer accept failed", error instanceof Error ? error : undefined, { offerId, },);
      this.error = t("status.tradeFailed",);
    } finally {
      this.busy = false;
    }
  },

  async counterOffer(offerId: string,) {
    const worldId = this._worldId;
    const myActorId = this._myActorId;
    if (!worldId || !myActorId || this.busy) { return; }
    const rows = selectedRows(this.myItems, this.draft.playerIds,);
    const offer = this.offers.find((row,) => row.id === offerId);
    const mineIsBuyer = offer?.buyerActorId === myActorId;
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const lines = tradeLines(rows,);

      const body: {
        counterActorId: string;
        buyerItems?: TradeLine[];
        sellerItems?: TradeLine[];
        price?: number;
      } = { counterActorId: myActorId, };

      if (lines.length > 0) { body[mineIsBuyer ? "buyerItems" : "sellerItems"] = lines; }

      const counter = priceOrUnset(this.counterPrice,);
      if (counter !== undefined) { body.price = counter; }
      const res = await apiFetch(`/api/v1/worlds/${worldId}/trade/offers/${offerId}/counter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(body,),
      },);

      if (!res.ok) {
        this.error = await routeError(res, t("status.tradeOfferCounterFailed",),);
        return;
      }

      this.draft = emptyDraft();
      this.confirmingAcceptId = null;
      this.message = t("status.tradeOfferCountered",);
      await this.loadOffers();
    } catch (error) {
      log.error("Trade offer counter failed", error instanceof Error ? error : undefined, { offerId, },);
      this.error = t("status.tradeOfferCounterFailed",);
    } finally {
      this.busy = false;
    }
  },

  async cancelOffer(offerId: string,) {
    const worldId = this._worldId;
    const myActorId = this._myActorId;
    if (!worldId || !myActorId || this.busy) { return; }
    this.busy = true;
    this.error = "";
    this.message = "";
    try {
      const res = await apiFetch(`/api/v1/worlds/${worldId}/trade/offers/${offerId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ buyerActorId: myActorId, },),
      },);

      if (!res.ok) {
        this.error = await routeError(res, t("status.tradeOfferCancelFailed",),);
        return;
      }

      if (this.selectedOfferId === offerId) { this.selectedOfferId = null; }
      this.confirmingAcceptId = null;
      this.message = t("status.tradeOfferCancelled",);
      await this.loadOffers();
    } catch (error) {
      log.error("Trade offer cancel failed", error instanceof Error ? error : undefined, { offerId, },);
      this.error = t("status.tradeOfferCancelFailed",);
    } finally {
      this.busy = false;
    }
  },

  selectedOffer() {
    return this.offers.find((offer,) => offer.id === this.selectedOfferId) ?? null;
  },

  canActSelected(kind: "accept" | "cancel" | "counter",) {
    const offer = this.selectedOffer();
    const actor = this._myActorId;
    if (offer === null || actor === null) { return false; }
    const gate = kind === "accept" ? canAccept : kind === "cancel" ? canCancel : canCounter;
    return gate(offer, actor,);
  },
});

/**
 * Build the Alpine scope for one actor's offers in a world.
 * @param worldId World the offers settle in.
 * @param myActorId Actor viewing + acting on offers.
 * @returns Offers state; caller triggers `load()`.
 */
export function inventoryOffersFactory(
  worldId: string,
  myActorId: string,
): InventoryOffersState {
  return stateFromOfferActors(worldId, myActorId,);
}

export const inventoryOffers = stateFromOfferActors();

(globalThis as Record<string, unknown>).inventoryOffersFactory = inventoryOffersFactory;
(globalThis as Record<string, unknown>).inventoryOffers = inventoryOffers;
