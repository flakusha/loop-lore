// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade panel helper tests: body decoders, price norm, error reason, open filter.
 */
import { describe, expect, test, } from "bun:test";
import type { TradeHistoryRow, TradeOfferRow, } from "./trade-offers.js";
import {
  historyFromBody,
  offerIsOpen,
  offersFromBody,
  priceOrUnset,
  routeErrorMessage,
} from "./trade-panel.js";

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
