// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade offer gate tests: accept/cancel/counter rules.
 */
import { describe, expect, test, } from "bun:test";
import {
  canAccept,
  canCancel,
  canCounter,
  type TradeOfferRow,
} from "./trade-offers";

const offer = (overrides: Partial<TradeOfferRow> = {},): TradeOfferRow => ({
  id: "offer-1",
  buyerActorId: "buyer-1",
  sellerActorId: "seller-1",
  price: 100,
  items: [{ worldItemId: "inst-a", quantity: 1, },],
  sellerItems: [],
  status: "pending",
  deadline: null,
  createdAt: "2026-10-30T00:00:00.000Z",
  ...overrides,
});

describe("offer gates", () => {
  test("seller accepts pending, buyer accepts countered, wrong side cannot", () => {
    expect(canAccept(offer(), "seller-1",),).toBe(true,);
    expect(canAccept(offer(), "buyer-1",),).toBe(false,);
    expect(canAccept(offer({ status: "countered", },), "buyer-1",),).toBe(true,);
    expect(canAccept(offer({ status: "countered", },), "seller-1",),).toBe(false,);
    expect(canAccept(offer({ status: "accepted", },), "buyer-1",),).toBe(false,);
  });

  test("only the creator cancels; accepted offers never mutate", () => {
    expect(canCancel(offer(), "buyer-1",),).toBe(true,);
    expect(canCancel(offer(), "seller-1",),).toBe(false,);
    expect(canCancel(offer({ status: "accepted", },), "buyer-1",),).toBe(false,);
    expect(canCounter(offer({ status: "accepted", },), "buyer-1",),).toBe(false,);
    expect(canAccept(offer({ status: "accepted", },), "seller-1",),).toBe(false,);
  });
});
