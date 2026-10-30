// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade offer gating helpers — pure predicates over pending offer rows.
 *
 * Rendering lives in Alpine templates; this module keeps only the
 * role/status rules plus the row types callers share.
 */

/** One pending offer as listed by GET .../trade/offers. */
export interface TradeOfferRow {
  id: string;
  buyerActorId: string;
  sellerActorId: string | null;
  price: number;
  items: Array<{ worldItemId: string; quantity: number }>;
  sellerItems: Array<{ worldItemId: string; quantity: number }>;
  status: string;
  deadline: string | null;
  createdAt: string;
}

/** One completed trade as listed by GET .../trade/history. */
export interface TradeHistoryRow {
  id: string;
  buyerActorId: string;
  sellerActorId: string;
  price: number;
  itemsOffered: string[];
  itemsRequested: string[];
  createdAt: string;
}

/** Whether an offer status is still actionable in the open list. */
export function isOpenOfferStatus(status: string,): boolean {
  return status === "pending" || status === "countered";
}

/** Whether a terms draft is empty: no rows and no explicit price. */
export function draftHasNoTerms(price: number | null, rowCount: number,): boolean {
  return rowCount === 0 && (price === null || price === 0);
}

/** Whether this side may accept right now: seller accepts pending, buyer accepts countered. */
export function canAccept(offer: TradeOfferRow, myActorId: string,): boolean {
  if (offer.status === "pending") { return offer.sellerActorId === myActorId; }
  if (offer.status === "countered") { return offer.buyerActorId === myActorId; }
  return false;
}

/** Whether the viewer created this offer (only the creator can cancel). */
export function canCancel(offer: TradeOfferRow, myActorId: string,): boolean {
  if (offer.status !== "pending" && offer.status !== "countered") { return false; }
  return offer.buyerActorId === myActorId;
}

/** Whether either participant may add terms right now. */
export function canCounter(offer: TradeOfferRow, myActorId: string,): boolean {
  if (offer.status !== "pending" && offer.status !== "countered") { return false; }
  return offer.buyerActorId === myActorId || offer.sellerActorId === myActorId;
}
