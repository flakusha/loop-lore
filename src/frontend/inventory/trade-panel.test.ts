// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade panel helper tests: body decoders, price norm, error reason, open filter.
 */
import { describe, expect, test, } from "bun:test";
import type { InventoryItem, } from "./inventory-grid.js";
import type { TradeHistoryRow, TradeOfferRow, } from "./trade-offers.js";
import {
  emptyDraft,
  enrichInstances,
  historyFromBody,
  offerIsOpen,
  offersFromBody,
  ownedBy,
  priceOrUnset,
  routeErrorMessage,
  rowsFromBody,
  rowsValue,
  selectedRows,
  summarizeTrade,
  toggleId,
  tradeLines,
} from "./trade-panel.js";

const sword = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "sword",
  name: "Iron Sword",
  itemType: "weapon",
  rarity: "common",
  quantity: 1,
  value: 50,
  ...overrides,
});

const potion = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "potion",
  name: "Health Potion",
  itemType: "consumable",
  rarity: "uncommon",
  quantity: 3,
  value: 10,
  ...overrides,
});

const steelSword = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "steel-sword",
  name: "Steel Sword",
  itemType: "weapon",
  rarity: "uncommon",
  quantity: 1,
  value: 100,
  ...overrides,
});

const offer = (overrides: Partial<TradeOfferRow> = {},): TradeOfferRow => ({
  id: "offer-1",
  buyerActorId: "me",
  sellerActorId: "them",
  price: 100,
  items: [],
  sellerItems: [],
  status: "pending",
  deadline: null,
  createdAt: "2026-10-30T00:00:00.000Z",
  ...overrides,
});

const historyRow = (overrides: Partial<TradeHistoryRow> = {},): TradeHistoryRow => ({
  id: "t-1",
  buyerActorId: "me",
  sellerActorId: "them",
  price: 50,
  itemsOffered: ["a",],
  itemsRequested: [],
  createdAt: "2026-10-30T00:00:00.000Z",
  ...overrides,
});

describe("trade panel helpers", () => {
  test("priceOrUnset treats null and 0 as unset", () => {
    expect(priceOrUnset(null,),).toBeUndefined();
    expect(priceOrUnset(0,),).toBeUndefined();
    expect(priceOrUnset(75,),).toBe(75,);
  });

  test("routeErrorMessage prefers error, then message, then fallback", () => {
    expect(routeErrorMessage({ error: "bad", code: "BAD_REQUEST", }, "fb",),).toBe("bad",);
    expect(routeErrorMessage({ message: "legacy", }, "fb",),).toBe("legacy",);
    expect(routeErrorMessage({}, "fb",),).toBe("fb",);
    expect(routeErrorMessage(null, "fb",),).toBe("fb",);
  });

  test("offerIsOpen matches pending and countered only", () => {
    expect(offerIsOpen(offer({ status: "pending", },),),).toBe(true,);
    expect(offerIsOpen(offer({ status: "countered", },),),).toBe(true,);
    expect(offerIsOpen(offer({ status: "accepted", },),),).toBe(false,);
  });

  test("offersFromBody keeps only open offers", () => {
    const rows = [
      offer({ id: "open", status: "pending", },),
      offer({ id: "countered", status: "countered", },),
      offer({ id: "closed", status: "accepted", },),
    ];

    expect(offersFromBody({ offers: rows, },).map((row,) => row.id),).toEqual([
      "open",
      "countered",
    ],);

    expect(offersFromBody({},),).toEqual([],);
  });

  test("historyFromBody unwraps history rows", () => {
    const row = historyRow();
    expect(historyFromBody({ history: [row,], },),).toEqual([row,],);

    expect(historyFromBody({},),).toEqual([],);
  });
});

describe("trade draft", () => {
  test("toggleId adds then drops an id", () => {
    expect(toggleId([], "a",),).toEqual(["a",],);
    expect(toggleId(["a",], "a",),).toEqual([],);
  });

  test("summarizeTrade totals value x quantity per side with net", () => {
    const summary = summarizeTrade([sword(), potion(),], [steelSword(),], {
      playerIds: ["potion",],
      npcIds: ["steel-sword",],
    },);

    expect(summary.playerItems.map((item,) => item.id),).toEqual(["potion",],);
    expect(summary.playerValue,).toBe(30,);
    expect(summary.npcValue,).toBe(100,);
    expect(summary.net,).toBe(-70,);
  });

  test("summarizeTrade drops unknown ids; tradeLines maps id to worldItemId", () => {
    const summary = summarizeTrade([sword(),], [], { playerIds: ["nope",], npcIds: [], },);
    expect(summary.playerItems,).toEqual([],);
    expect(summary.playerValue,).toBe(0,);
    expect(tradeLines([sword(), potion(),],),).toEqual([
      { worldItemId: "sword", quantity: 1, },
      { worldItemId: "potion", quantity: 3, },
    ],);
  });

  test("enrichInstances joins instances to definitions by item_id", () => {
    const instances = [
      { ...sword(), id: "inst-1", item_id: "sword", },
      { ...sword(), id: "orphan", item_id: "missing-def", },
    ] as unknown as InventoryItem[];

    expect(enrichInstances(instances, [sword(),],),).toEqual([{ ...sword(), id: "inst-1", },],);
  });

  test("ownedBy keeps only rows the actor owns", () => {
    const body = [null, { id: "a", owner_actor_id: "npc-1", }, { id: "b", owner_actor_id: "other", },] as unknown[];
    const expected = [{ id: "a", owner_actor_id: "npc-1", },] as unknown as InventoryItem[];
    expect(ownedBy(body, "npc-1",),).toEqual(expected,);
  });

  test("emptyDraft starts with both sides empty", () => {
    expect(emptyDraft(),).toEqual({ playerIds: [], npcIds: [], },);
  });

  test("selectedRows keeps only chosen ids", () => {
    expect(selectedRows([sword(), potion(),], ["potion",],).map((item,) => item.id),).toEqual(["potion",],);
  });

  test("rowsValue sums value x quantity", () => {
    expect(rowsValue([sword(), potion(),],),).toBe(80,);
    expect(rowsValue([{ ...sword(), value: undefined, quantity: undefined, },],),).toBe(0,);
  });

  test("rowsFromBody unwraps data and passes bare arrays through", () => {
    const rows = [sword(),];
    expect(rowsFromBody({ data: rows, },),).toEqual(rows,);
    expect(rowsFromBody(rows,),).toEqual(rows,);
    expect(rowsFromBody(null,),).toEqual([],);
  });
});
