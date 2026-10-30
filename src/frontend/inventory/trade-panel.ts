// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade draft: selection + pricing over plain rows.
 * Pure logic, no DOM or fetch.
 */
import type { InventoryItem, } from "./inventory-grid.js";
import { isOpenOfferStatus, } from "./trade-offers.js";
import type { TradeHistoryRow, TradeOfferRow, } from "./trade-offers.js";

/** One transfer line, matching the NPC trade route body shape. */
export interface TradeLine {
  /** Instance to move; the list row id is sent here. */
  worldItemId: string;
  /** Instances to move; minimum 1. */
  quantity: number;
}

/** Gold totals for the current draft. */
export interface TradeSummary {
  /** Selected player-side rows (items the player gives). */
  playerItems: InventoryItem[];
  /** Selected NPC-side rows (items the player gets). */
  npcItems: InventoryItem[];
  /** Gold value of the player side. */
  playerValue: number;
  /** Gold value of the NPC side. */
  npcValue: number;
  /** Player's net gold change: playerValue - npcValue (negative = pays out). */
  net: number;
}

/** Selected row ids per side of the draft. */
export interface TradeDraft {
  playerIds: string[];
  npcIds: string[];
}

/** Empty draft: nothing selected on either side. */
export function emptyDraft(): TradeDraft {
  return { playerIds: [], npcIds: [], };
}

/** Toggle an id in a selection list. */
export function toggleId(ids: string[], id: string,): string[] {
  return ids.includes(id,) ? ids.filter((kept,) => kept !== id) : [...ids, id,];
}

/** Rows of `items` in the selection; unknown ids are dropped. */
export function selectedRows(items: InventoryItem[], ids: string[],): InventoryItem[] {
  const wanted = new Set(ids,);
  return items.filter((item,) => wanted.has(item.id,));
}

/** Gold value of rows: `(value ?? 0) x (quantity ?? 1)` summed. */
export function rowsValue(rows: InventoryItem[],): number {
  return rows.reduce((total, item,) => total + (item.value ?? 0) * (item.quantity ?? 1), 0,);
}

/** Summarize the draft against the two item lists. */
export function summarizeTrade(
  playerItems: InventoryItem[],
  npcItems: InventoryItem[],
  draft: TradeDraft,
): TradeSummary {
  const playerRows = selectedRows(playerItems, draft.playerIds,);
  const npcRows = selectedRows(npcItems, draft.npcIds,);
  const playerValue = rowsValue(playerRows,);
  const npcValue = rowsValue(npcRows,);
  return { playerItems: playerRows, npcItems: npcRows, playerValue, npcValue, net: playerValue - npcValue, };
}

/** Whether an offer belongs in the open list: still actionable by either side. */
export function offerIsOpen(offer: TradeOfferRow,): boolean {
  return isOpenOfferStatus(offer.status,);
}

/** TradeLine payload for one side: row `id` becomes `worldItemId`. */
export function tradeLines(rows: InventoryItem[],): TradeLine[] {
  return rows.map((item,) => ({ worldItemId: item.id, quantity: item.quantity ?? 1, }));
}

/** Decode GET offers, keeping only actionable rows: terminal offers live in history. */
export function offersFromBody(body: unknown,): TradeOfferRow[] {
  if (body !== null && typeof body === "object" && "offers" in body) {
    const offers = (body as { offers?: unknown }).offers;
    if (Array.isArray(offers,)) { return (offers as TradeOfferRow[]).filter(offerIsOpen,); }
  }

  return [];
}

interface InstanceItemId {
  item_id?: unknown;
}
export function enrichInstances(
  instances: InventoryItem[],
  definitions: InventoryItem[],
): InventoryItem[] {
  const byId = new Map(definitions.map((def,) => [def.id, def,]),);
  const rows: InventoryItem[] = [];
  for (const inst of instances) {
    const itemId = (inst as InventoryItem & InstanceItemId).item_id;
    const def = typeof itemId === "string" ? byId.get(itemId,) : undefined;
    if (!def) { continue; }
    rows.push({ ...def, id: inst.id, quantity: inst.quantity ?? 1, },);
  }

  return rows;
}

/** Decode a list body: `{ data }` or a bare array. */
export function rowsFromBody(body: unknown,): InventoryItem[] {
  if (body !== null && typeof body === "object" && "data" in body) {
    const data = (body as { data?: unknown }).data;
    if (Array.isArray(data,)) { return data as InventoryItem[]; }
  }

  return Array.isArray(body,) ? body as InventoryItem[] : [];
}

/** Keep item-instance rows owned by one actor. */
interface OwnedInstance {
  owner_actor_id?: unknown;
  ownerActorId?: unknown;
}

export function ownedBy(body: unknown, actorId: string,): InventoryItem[] {
  const rows = rowsFromBody(body,) as Array<InventoryItem & OwnedInstance>;

  return rows.filter((row,) => row != null && (row.owner_actor_id === actorId || row.ownerActorId === actorId));
}

/** Normalize a draft price: cleared (null) and 0 both mean unset. */
export function priceOrUnset(value: number | null,): number | undefined {
  return value === null || value === 0 ? undefined : value;
}

/** Decode GET history: the route wraps rows in `{ history }`. */
export function historyFromBody(body: unknown,): TradeHistoryRow[] {
  if (body !== null && typeof body === "object" && "history" in body) {
    const history = (body as { history?: unknown }).history;
    if (Array.isArray(history,)) { return history as TradeHistoryRow[]; }
  }

  return [];
}

interface ErrorBody {
  error?: unknown;
  message?: unknown;
}

/** Surface a route error reason: server `{ error }` first, legacy `{ message }` next. */
export function routeErrorMessage(body: unknown, fallback: string,): string {
  if (body !== null && typeof body === "object" && ("error" in body || "message" in body)) {
    const shaped = body as ErrorBody;
    const reason = shaped.error ?? shaped.message;
    if (typeof reason === "string" && reason.length > 0) { return reason; }
  }

  return fallback;
}
