// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade offers render tests: role/status gating + confirm step, fake DOM.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { installBattleDom, makeEl, query, } from "../tests/battle-fake-dom";
import {
  canAccept,
  canCancel,
  canCounter,
  offerRole,
  renderOfferList,
  renderTradeHistory,
  renderTradeWindow,
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

let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
},);

describe("offer role gates", () => {
  test("role resolves buyer/seller/other", () => {
    expect(offerRole(offer(), "buyer-1",),).toBe("buyer",);
    expect(offerRole(offer(), "seller-1",),).toBe("seller",);
    expect(offerRole(offer(), "stranger",),).toBe("other",);
  });

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

describe("renderOfferList", () => {
  test("empty state and rows carry status badge, price, counts", () => {
    const root = makeEl();
    const el = root as unknown as HTMLElement;
    renderOfferList(el, [], {},);
    expect(query(root, '[data-trade-part="empty"]',)?.textContent,).toBe("No open offers.",);

    renderOfferList(el, [offer(), offer({ id: "offer-2", status: "countered", },),], { myActorId: "seller-1", },);
    expect(root.children.length,).toBe(2,);
    const first = query(root, '[data-offer-id="offer-1"]',)!;
    expect(first.attrs["data-offer-status"],).toBe("pending",);
    expect(query(first, '[data-trade-part="price"]',)?.textContent,).toBe("100 Gold",);
    expect(query(first, '[data-trade-part="counts"]',)?.textContent,).toBe("1 + 0 items",);
    expect(query(first, '[data-trade-part="parties"]',)?.textContent,).toBe("You sell",);
  });
});

describe("renderTradeWindow", () => {
  test("seller sees accept, buyer sees cancel; accept is confirm-gated", () => {
    const root = makeEl();
    const seen: string[] = [];
    const actions = {
      onAccept: (id: string,) => {
        seen.push(`accept:${id}`,);
      },
      onCancel: (id: string,) => {
        seen.push(`cancel:${id}`,);
      },
    };

    const el = root as unknown as HTMLElement;
    renderTradeWindow(el, offer(), { myActorId: "seller-1", }, actions,);
    expect(query(root, '[data-trade-action="accept"]',)?.textContent,).toBe("Accept",);
    expect(query(root, '[data-trade-action="cancel"]',),).toBeNull();
    const theirs = query(root, '[data-trade-pane="theirs"]',)!;
    expect(query(theirs, '[data-line-id="inst-a"]',),).not.toBeNull();

    renderTradeWindow(el, offer(), { myActorId: "buyer-1", }, actions,);
    expect(query(root, '[data-trade-action="accept"]',),).toBeNull();
    expect(query(root, '[data-trade-action="cancel"]',),).not.toBeNull();

    renderTradeWindow(el, offer(), { myActorId: "seller-1", confirmingAccept: true, }, actions,);
    const armed = query(root, '[data-trade-action="accept"]',)!;
    expect(armed.textContent,).toBe("Confirm Accept",);
    armed.click();
    expect(seen,).toEqual(["accept:offer-1",],);
  });

  test("countered offer: buyer sees accept + counter; mine/theirs panes split by side", () => {
    const root = makeEl();
    const countered = offer({
      status: "countered",
      items: [{ worldItemId: "inst-a", quantity: 2, },],
      sellerItems: [{ worldItemId: "inst-b", quantity: 1, },],
    },);

    const el = root as unknown as HTMLElement;
    renderTradeWindow(
      el,
      countered,
      {
        myActorId: "buyer-1",
        myItems: [{ id: "inst-a", name: "Iron Sword", itemType: "weapon", },],
        theirItems: [{ id: "inst-b", name: "Steel Shield", itemType: "armor", },],
      },
      { onAccept: () => {}, onCounter: () => {}, },
    );

    expect(query(root, '[data-trade-action="accept"]',),).not.toBeNull();
    expect(query(root, '[data-trade-action="counter"]',),).not.toBeNull();
    const mine = query(root, '[data-trade-pane="mine"]',)!;
    const counterTheirs = query(root, '[data-trade-pane="theirs"]',)!;
    expect(query(mine, '[data-line-id="inst-a"]',)?.textContent,).toContain("Iron Sword",);
    expect(query(counterTheirs, '[data-line-id="inst-b"]',)?.textContent,).toContain("Steel Shield",);
  });

  test("stranger sees no action buttons", () => {
    const root = makeEl();
    const el = root as unknown as HTMLElement;
    renderTradeWindow(el, offer(), { myActorId: "stranger", }, {
      onAccept: () => {},
      onCounter: () => {},
      onCancel: () => {},
    },);

    expect(query(root, '[data-trade-part="actions"]',)?.children.length,).toBe(0,);
  });
});

describe("renderTradeHistory", () => {
  test("empty state and newest-first rows", () => {
    const root = makeEl();
    const el = root as unknown as HTMLElement;
    renderTradeHistory(el, [],);
    expect(query(root, '[data-trade-part="empty"]',),).not.toBeNull();
    renderTradeHistory(el, [
      {
        id: "t-1",
        buyerActorId: "b",
        sellerActorId: "s",
        price: 50,
        itemsOffered: ["a",],
        itemsRequested: [],
        createdAt: "x",
      },
    ],);

    expect(query(root, '[data-trade-id="t-1"]',)?.textContent,).toContain("50 Gold",);
  });
});
