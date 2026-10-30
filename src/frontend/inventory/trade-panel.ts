// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade draft — selection + pricing over plain inventory rows.
 * Pure logic, no DOM or fetch; shared by the trading render
 * (trading-interface.ts) and the Alpine trading module.
 */
import type { InventoryItem, } from "./inventory-grid.js";

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

/**
 * Empty draft: nothing selected on either side.
 * @returns A fresh draft.
 */
export function emptyDraft(): TradeDraft {
  return { playerIds: [], npcIds: [], };
}

/**
 * Toggle an id in a selection list.
 * @param ids Current selection.
 * @param id Row id to add or drop.
 * @returns The new selection.
 */
export function toggleId(ids: string[], id: string,): string[] {
  return ids.includes(id,) ? ids.filter((kept,) => kept !== id) : [...ids, id,];
}

/**
 * Rows of `items` in the selection; unknown ids are dropped.
 * @param items Candidate rows.
 * @param ids Selected ids.
 * @returns Selected rows, in list order.
 */
export function selectedRows(items: InventoryItem[], ids: string[],): InventoryItem[] {
  const wanted = new Set(ids,);
  return items.filter((item,) => wanted.has(item.id,));
}

/**
 * Gold value of rows: `(value ?? 0) x (quantity ?? 1)` summed.
 * @param rows Rows to price.
 * @returns Total gold value.
 */
export function rowsValue(rows: InventoryItem[],): number {
  return rows.reduce((total, item,) => total + (item.value ?? 0) * (item.quantity ?? 1), 0,);
}

/**
 * Summarize the draft against the two item lists.
 * @param playerItems Player-side rows.
 * @param npcItems NPC-side rows.
 * @param draft Current selection.
 * @returns Selected rows plus gold totals.
 */
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

/**
 * TradeLine payload for one side: row `id` becomes `worldItemId`.
 * @param rows Selected rows for one side.
 * @returns Transfer lines for the route body.
 */
export function tradeLines(rows: InventoryItem[],): TradeLine[] {
  return rows.map((item,) => ({ worldItemId: item.id, quantity: item.quantity ?? 1, }));
}

/**
 * Enrich bare item-instance rows with their definitions for display.
 * Instances carry only `item_id` + `quantity`; names, prices, and types
 * live on the definition rows from `GET /api/v1/worlds/:worldId/items`.
 * Unmatched instances are dropped (their definition is gone).
 * @param instances Rows filtered to the NPC side (instance ids).
 * @param definitions Definition rows keyed by definition id.
 * @returns Display-ready rows keyed by instance id.
 */
export function enrichInstances(
  instances: InventoryItem[],
  definitions: InventoryItem[],
): InventoryItem[] {
  const byId = new Map(definitions.map((def,) => [def.id, def,]),);
  const rows: InventoryItem[] = [];
  for (const inst of instances) {
    const itemId = (inst as InventoryItem & { item_id?: unknown }).item_id;
    const def = typeof itemId === "string" ? byId.get(itemId,) : undefined;
    if (!def) { continue; }
    rows.push({ ...def, id: inst.id, quantity: inst.quantity ?? 1, },);
  }

  return rows;
}

/**
 * Decode a list body: the generic entity shape is `{ data }`, bare arrays pass through.
 * @param body Parsed response body.
 * @returns Row list, empty when the shape is unknown.
 */
export function rowsFromBody(body: unknown,): InventoryItem[] {
  if (body && typeof body === "object" && Array.isArray((body as { data?: unknown }).data,)) {
    return (body as { data: InventoryItem[] }).data;
  }

  return Array.isArray(body,) ? (body as InventoryItem[]) : [];
}

/**
 * Keep item-instance rows owned by one actor; instances carry owner_actor_id.
 * @param body Parsed response body.
 * @param actorId Owner to keep.
 * @returns Rows owned by the actor.
 */
export function ownedBy(body: unknown, actorId: string,): InventoryItem[] {
  const rows = rowsFromBody(body,) as Array<InventoryItem & { owner_actor_id?: unknown; ownerActorId?: unknown }>;

  return rows.filter((row,) => row != null && (row.owner_actor_id === actorId || row.ownerActorId === actorId));
}

/**
 * Normalize a draft price: a cleared `x-model.number` input writes null, and
 * 0 means "no explicit price" — both are unset so the caller falls back.
 * @param value The raw price, possibly null after the input is cleared.
 * @returns The price, or undefined when unset.
 */
export function priceOrUnset(value: number | null,): number | undefined {
  return value === null || value === 0 ? undefined : value;
}
