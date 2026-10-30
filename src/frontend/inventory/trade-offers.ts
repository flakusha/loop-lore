// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade offers — pure render over pending offer rows.
 *
 * Two surfaces: an offer list (status badge, parties, price, item counts)
 * and a secure trade window (two-pane: my offered lines vs their offered
 * lines, price, accept/counter/cancel buttons gated by role + status, with
 * a confirm step before accept). No DOM fetching; the Alpine module
 * (inventory-offers.ts) supplies rows and callbacks.
 */
import type { InventoryItem, } from "./inventory-grid.js";

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

/** Role of the viewer on one offer. */
export type OfferRole = "buyer" | "seller" | "other";

/** Resolve the viewer's side of an offer. */
export function offerRole(offer: TradeOfferRow, myActorId: string,): OfferRole {
  if (offer.buyerActorId === myActorId) { return "buyer"; }
  if (offer.sellerActorId === myActorId) { return "seller"; }
  return "other";
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

/** Callbacks for the offer list + trade window. */
export interface TradeOffersActions {
  onSelect?(offerId: string,): void;
  onAccept?(offerId: string,): void;
  onCounter?(offerId: string,): void;
  onCancel?(offerId: string,): void;
}

/** Options for the offer list render. */
export interface OfferListOptions {
  myActorId?: string | null;
  selectedId?: string | null;
}

/** Options for the trade window render. */
export interface TradeWindowOptions {
  myActorId: string;
  /** Counterparty's offered lines are shown; their inventory is never rendered. */
  myItems?: InventoryItem[];
  theirItems?: InventoryItem[];
  confirmingAccept?: boolean;
}

/**
 * Render the offer list: one row per offer with status badge, parties,
 * price, and item counts. Previous children are replaced.
 */
export function renderOfferList(
  container: HTMLElement,
  offers: TradeOfferRow[],
  options: OfferListOptions = {},
  actions: TradeOffersActions = {},
): void {
  container.replaceChildren();
  container.className = "trade-offers";
  if (offers.length === 0) {
    const empty = document.createElement("div",);
    empty.className = "trade-offers-empty";
    empty.setAttribute("data-trade-part", "empty",);
    empty.textContent = "No open offers.";
    container.append(empty,);
    return;
  }

  for (const offer of offers) {
    container.append(buildOfferRow(offer, options, actions,),);
  }
}

function buildOfferRow(
  offer: TradeOfferRow,
  options: OfferListOptions,
  actions: TradeOffersActions,
): HTMLElement {
  const row = document.createElement("div",);
  row.className = "trade-offer" + (options.selectedId === offer.id ? " selected" : "");
  row.setAttribute("data-offer-id", offer.id,);
  row.setAttribute("data-offer-status", offer.status,);

  const badge = document.createElement("span",);
  badge.className = `trade-offer-status trade-offer-status-${offer.status}`;
  badge.setAttribute("data-trade-part", "status",);
  badge.textContent = offer.status;
  row.append(badge,);

  const parties = document.createElement("span",);
  parties.className = "trade-offer-parties";
  parties.setAttribute("data-trade-part", "parties",);
  parties.textContent = options.myActorId
    ? (offerRole(offer, options.myActorId,) === "buyer" ? "You buy" : "You sell")
    : `${offer.buyerActorId} → ${offer.sellerActorId ?? "?"}`;

  row.append(parties,);

  const price = document.createElement("span",);
  price.className = "trade-offer-price";
  price.setAttribute("data-trade-part", "price",);
  price.textContent = `${offer.price} Gold`;
  row.append(price,);

  const counts = document.createElement("span",);
  counts.className = "trade-offer-counts";
  counts.setAttribute("data-trade-part", "counts",);
  counts.textContent = `${offer.items.length} + ${offer.sellerItems.length} items`;
  row.append(counts,);

  if (actions.onSelect) {
    const onSelect = actions.onSelect;
    const open = document.createElement("button",);
    open.className = "trade-offer-open";
    open.setAttribute("data-trade-action", "open",);
    open.textContent = "Open";
    open.addEventListener("click", () => {
      onSelect(offer.id,);
    },);

    row.append(open,);
  }

  return row;
}

/**
 * Render the secure trade window for one offer: two panes (my offered
 * lines vs their offered lines — never their inventory), price, and
 * role+status gated action buttons. Accept requires the confirm step:
 * first click arms it (`confirmingAccept`), second click fires onAccept.
 */
export function renderTradeWindow(
  container: HTMLElement,
  offer: TradeOfferRow,
  options: TradeWindowOptions,
  actions: TradeOffersActions = {},
): void {
  const { myActorId, myItems = [], theirItems = [], confirmingAccept = false, } = options;
  const mineIsBuyer = offer.buyerActorId === myActorId;
  const myLines = mineIsBuyer ? offer.items : offer.sellerItems;
  const theirLines = mineIsBuyer ? offer.sellerItems : offer.items;
  container.replaceChildren();
  container.className = "trade-window";
  container.setAttribute("data-offer-id", offer.id,);
  container.setAttribute("data-offer-status", offer.status,);

  container.append(
    buildOfferPane("mine", myLines, myItems,),
    buildOfferPane("theirs", theirLines, theirItems,),
  );

  const price = document.createElement("div",);
  price.className = "trade-window-price";
  price.setAttribute("data-trade-part", "price",);
  price.textContent = `Price: ${offer.price} Gold`;
  container.append(price,);

  const bar = document.createElement("div",);
  bar.className = "trade-window-actions";
  bar.setAttribute("data-trade-part", "actions",);

  if (canAccept(offer, myActorId,) && actions.onAccept) {
    const onAccept = actions.onAccept;
    const accept = document.createElement("button",);
    accept.className = "trade-window-accept";
    accept.setAttribute("data-trade-action", "accept",);
    accept.textContent = confirmingAccept ? "Confirm Accept" : "Accept";
    accept.addEventListener("click", () => {
      onAccept(offer.id,);
    },);

    bar.append(accept,);
  }

  if (canCounter(offer, myActorId,) && actions.onCounter) {
    const onCounter = actions.onCounter;
    const counter = document.createElement("button",);
    counter.className = "trade-window-counter";
    counter.setAttribute("data-trade-action", "counter",);
    counter.textContent = "Counter";
    counter.addEventListener("click", () => {
      onCounter(offer.id,);
    },);

    bar.append(counter,);
  }

  if (canCancel(offer, myActorId,) && actions.onCancel) {
    const onCancel = actions.onCancel;
    const cancel = document.createElement("button",);
    cancel.className = "trade-window-cancel";
    cancel.setAttribute("data-trade-action", "cancel",);
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      onCancel(offer.id,);
    },);

    bar.append(cancel,);
  }

  container.append(bar,);
}

function buildOfferPane(
  side: "mine" | "theirs",
  lines: Array<{ worldItemId: string; quantity: number }>,
  catalog: InventoryItem[],
): HTMLElement {
  const pane = document.createElement("div",);
  pane.className = `trade-window-pane trade-window-pane-${side}`;
  pane.setAttribute("data-trade-pane", side,);

  const heading = document.createElement("h3",);
  heading.setAttribute("data-trade-part", "title",);
  heading.textContent = side === "mine" ? "You offer" : "They offer";
  pane.append(heading,);

  const byId = new Map(catalog.map((item,) => [item.id, item,]),);
  if (lines.length === 0) {
    const empty = document.createElement("div",);
    empty.className = "trade-window-empty";
    empty.setAttribute("data-trade-part", "empty",);
    empty.textContent = "Nothing offered.";
    pane.append(empty,);
    return pane;
  }

  for (const line of lines) {
    const row = document.createElement("div",);
    row.className = "trade-window-line";
    row.setAttribute("data-line-id", line.worldItemId,);
    row.textContent = `${byId.get(line.worldItemId,)?.name ?? line.worldItemId} \u00d7 ${line.quantity}`;
    pane.append(row,);
  }

  return pane;
}

/** Render completed trades newest-first (caller sorts; route already does). */
export function renderTradeHistory(
  container: HTMLElement,
  history: TradeHistoryRow[],
): void {
  container.replaceChildren();
  container.className = "trade-history";
  if (history.length === 0) {
    const empty = document.createElement("div",);
    empty.className = "trade-history-empty";
    empty.setAttribute("data-trade-part", "empty",);
    empty.textContent = "No completed trades.";
    container.append(empty,);
    return;
  }

  for (const entry of history) {
    const row = document.createElement("div",);
    row.className = "trade-history-row";
    row.setAttribute("data-trade-id", entry.id,);
    row.setAttribute("data-trade-part", "row",);
    row.textContent = `${entry.buyerActorId} ↔ ${entry.sellerActorId}: ${entry.price} Gold ` +
      `(${entry.itemsOffered.length} + ${entry.itemsRequested.length} items)`;

    container.append(row,);
  }
}
