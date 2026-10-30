// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { InventoryItem, } from "../inventory/inventory-grid";
import { inventoryOffers, inventoryOffersFactory, stateFromOfferActors, } from "./inventory-offers";

// ── Mock apiFetch (inventory-offers imports ./htmx) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({ data: [], },);

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: ((url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

/** Drive the microtask queue so async `load()` chains resolve. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 25; i++) {
    const { promise, resolve, } = Promise.withResolvers<void>();
    queueMicrotask(() => {
      resolve();
    },);

    await promise;
  }
};

const sword = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "sword",
  name: "Iron Sword",
  itemType: "weapon",
  rarity: "common",
  quantity: 1,
  value: 50,
  ...overrides,
});

const offerBody = (overrides: Record<string, unknown> = {},) => ({
  id: "offer-1",
  buyerActorId: "me",
  sellerActorId: "them",
  price: 100,
  items: [{ worldItemId: "inst-a", quantity: 1, },],
  sellerItems: [],
  status: "pending",
  deadline: null,
  createdAt: "2026-10-30T00:00:00.000Z",
  ...overrides,
});

afterEach(() => {
  calls = [];
  handler = async () => Response.json({ data: [], },);
},);

describeOrSkip("inventory offers state", () => {
  test("load pulls my instances + polls offers", async () => {
    handler = async (url: string,) => {
      if (url === "/api/v1/worlds/world-1/item-instances") {
        return Response.json([
          { id: "inst-a", item_id: "sword", quantity: 2, owner_actor_id: "me", },
          { id: "stray", item_id: "sword", quantity: 1, owner_actor_id: "them", },
        ],);
      }

      if (url.startsWith("/api/v1/worlds/world-1/items",)) {
        return Response.json({ data: [sword(),], },);
      }

      if (url.startsWith("/api/v1/worlds/world-1/trade/offers",)) {
        return Response.json({ offers: [offerBody(),], },);
      }

      return Response.json({ data: [], },);
    };

    const state = stateFromOfferActors("world-1", "me",);
    await state.load();
    await flush();
    expect(state.myItems.map((item,) => item.id),).toEqual(["inst-a",],);
    expect(state.offers.map((offer,) => offer.id),).toEqual(["offer-1",],);
    expect(state.offersLoading,).toBe(false,);
    expect(state.myLoading,).toBe(false,);
    expect(calls.some((call,) => call.url.includes("/trade/offers?actorId=me",)),).toBe(true,);
  });

  test("createOffer posts buyer lines + price, then re-polls and clears the draft", async () => {
    handler = async (url: string, opts?: RequestInit,) => {
      if (url.endsWith("/trade/offers",) && opts?.method === "POST") {
        return Response.json({ ok: true, offerId: "offer-9", },);
      }

      if (url === "/api/v1/worlds/world-1/item-instances") {
        return Response.json([{ id: "inst-a", item_id: "sword", quantity: 2, owner_actor_id: "me", },],);
      }

      if (url.startsWith("/api/v1/worlds/world-1/items",)) {
        return Response.json({ data: [sword(),], },);
      }

      if (url.includes("/trade/offers?actorId=",)) {
        return Response.json({ offers: [offerBody({ id: "offer-9", },),], },);
      }

      return Response.json({ data: [], },);
    };

    const state = stateFromOfferActors("world-1", "me",);
    state.counterpartyId = "them";
    await state.loadMyItems();
    await flush();
    state.toggleMine("inst-a",);
    await state.createOffer();
    await flush();
    const create = calls.find((call,) => call.url.endsWith("/trade/offers",) && call.opts.method === "POST");
    expect(JSON.parse(String(create?.opts.body ?? "{}",),),).toEqual({
      buyerActorId: "me",
      sellerActorId: "them",
      buyerItems: [{ worldItemId: "inst-a", quantity: 2, },],
      price: 100,
    },);

    expect(state.draft.playerIds,).toEqual([],);
    expect(state.offers.map((offer,) => offer.id),).toEqual(["offer-9",],);
  });

  test("createOffer posts explicit offerPrice when set", async () => {
    handler = async (url: string, opts?: RequestInit,) => {
      if (url.endsWith("/trade/offers",) && opts?.method === "POST") {
        return Response.json({ ok: true, offerId: "offer-9", },);
      }

      if (url === "/api/v1/worlds/world-1/item-instances") {
        return Response.json([{ id: "inst-a", item_id: "sword", quantity: 2, owner_actor_id: "me", },],);
      }

      if (url.startsWith("/api/v1/worlds/world-1/items",)) {
        return Response.json({ data: [sword(),], },);
      }

      if (url.includes("/trade/offers?actorId=",)) {
        return Response.json({ offers: [offerBody({ id: "offer-9", },),], },);
      }

      return Response.json({ data: [], },);
    };

    const state = stateFromOfferActors("world-1", "me",);
    state.counterpartyId = "them";
    await state.loadMyItems();
    await flush();
    state.toggleMine("inst-a",);
    state.offerPrice = 250;
    await state.createOffer();
    await flush();
    const create = calls.find((call,) => call.url.endsWith("/trade/offers",) && call.opts.method === "POST");
    expect(JSON.parse(String(create?.opts.body ?? "{}",),),).toEqual({
      buyerActorId: "me",
      sellerActorId: "them",
      buyerItems: [{ worldItemId: "inst-a", quantity: 2, },],
      price: 250,
    },);
  });

  test("acceptOffer arms confirm first, posts actorId second, wrong side surfaces the 400", async () => {
    handler = async (url: string, _opts?: RequestInit,) => {
      if (url.endsWith("/accept",)) {
        return Response.json({ message: "wrong side", }, { status: 400, },);
      }

      if (url.includes("/trade/offers?actorId=",)) {
        return Response.json({ offers: [offerBody(),], },);
      }

      return Response.json({ data: [], },);
    };

    const state = stateFromOfferActors("world-1", "me",);
    await state.loadOffers();
    await flush();
    await state.acceptOffer("offer-1",);
    expect(state.confirmingAcceptId,).toBe("offer-1",);
    expect(calls.filter((call,) => call.url.endsWith("/accept",)).length,).toBe(0,);
    await state.acceptOffer("offer-1",);
    await flush();
    const accept = calls.find((call,) => call.url.endsWith("/accept",));
    expect(JSON.parse(String(accept?.opts.body ?? "{}",),),).toEqual({ actorId: "me", },);
    expect(state.error,).toBe("wrong side",);
    expect(state.confirmingAcceptId,).toBe("offer-1",);
  });

  test("counterOffer posts my side lines + price; cancelOffer clears selection", async () => {
    handler = async (url: string, _opts?: RequestInit,) => {
      if (url === "/api/v1/worlds/world-1/item-instances") {
        return Response.json([{ id: "inst-s", item_id: "sword", quantity: 1, owner_actor_id: "them", },],);
      }

      if (url.startsWith("/api/v1/worlds/world-1/items",)) {
        return Response.json({ data: [sword(),], },);
      }

      if (url.includes("/trade/offers?actorId=",)) {
        return Response.json({ offers: [], },);
      }

      return Response.json({ ok: true, },);
    };

    const state = stateFromOfferActors("world-1", "them",);
    await state.load();
    await flush();
    state.offers = [offerBody({ buyerActorId: "me", sellerActorId: "them", },),];
    state.toggleMine("inst-s",);
    state.counterPrice = 75;
    await state.counterOffer("offer-1",);
    await flush();
    const counter = calls.find((call,) => call.url.endsWith("/counter",));
    expect(JSON.parse(String(counter?.opts.body ?? "{}",),),).toEqual({
      counterActorId: "them",
      sellerItems: [{ worldItemId: "inst-s", quantity: 1, },],
      price: 75,
    },);

    state.offers = [offerBody({ buyerActorId: "them", sellerActorId: "other", },),];
    state.selectedOfferId = "offer-1";
    const creator = stateFromOfferActors("world-1", "them",);
    creator.offers = state.offers;
    creator.selectedOfferId = "offer-1";
    await creator.cancelOffer("offer-1",);
    await flush();
    const cancel = calls.find((call,) => call.url.endsWith("/cancel",));
    expect(JSON.parse(String(cancel?.opts.body ?? "{}",),),).toEqual({ buyerActorId: "them", },);
    expect(creator.selectedOfferId,).toBeNull();
  });

  test("counterOffer with empty draft + zero price omits terms so existing terms survive", async () => {
    handler = async (url: string, _opts?: RequestInit,) => {
      if (url === "/api/v1/worlds/world-1/item-instances") {
        return Response.json([{ id: "inst-s", item_id: "sword", quantity: 1, owner_actor_id: "them", },],);
      }

      if (url.startsWith("/api/v1/worlds/world-1/items",)) {
        return Response.json({ data: [sword(),], },);
      }

      if (url.includes("/trade/offers?actorId=",)) {
        return Response.json({ offers: [], },);
      }

      return Response.json({ ok: true, },);
    };

    const state = stateFromOfferActors("world-1", "them",);
    await state.load();
    await flush();
    state.offers = [offerBody({ buyerActorId: "me", sellerActorId: "them", },),];
    await state.counterOffer("offer-1",);
    await flush();
    const counter = calls.find((call,) => call.url.endsWith("/counter",));
    expect(JSON.parse(String(counter?.opts.body ?? "{}",),),).toEqual({
      counterActorId: "them",
    },);
  });

  test("loadHistory reads newest-first rows; TypeBox dump falls back", async () => {
    handler = async (url: string,) => {
      if (url.includes("/trade/history",)) {
        return Response.json({
          history: [{
            id: "t-1",
            buyerActorId: "me",
            sellerActorId: "them",
            price: 50,
            itemsOffered: ["a",],
            itemsRequested: [],
            createdAt: "x",
          },],
        },);
      }

      return Response.json({ data: [], },);
    };

    const state = stateFromOfferActors("world-1", "me",);
    await state.loadHistory();
    await flush();
    expect(state.history.map((entry,) => entry.id),).toEqual(["t-1",],);

    handler = async (url: string,) => {
      if (url.includes("/trade/history",)) {
        return Response.json({ not: "history-shaped", }, { status: 400, },);
      }

      return Response.json({ data: [], },);
    };

    await state.loadHistory();
    await flush();
    expect(state.historyError.length > 0,).toBe(true,);
  });

  test("setOfferActors resets; selectedOffer resolves the window row", async () => {
    const state = stateFromOfferActors("world-1", "me",);
    state.offers = [offerBody(),];
    state.selectedOfferId = "offer-1";
    expect(state.selectedOffer()?.id,).toBe("offer-1",);
    state.setOfferActors("world-2", "me-2",);
    expect(state.offers,).toEqual([],);
    expect(state.selectedOfferId,).toBeNull();
    expect(state._worldId,).toBe("world-2",);
  });
},);

describe("inventory offers scope", () => {
  test("inventoryOffersFactory scopes a panel to one world + actor", () => {
    const scoped = inventoryOffersFactory("world-1", "me",);
    expect(scoped._worldId,).toBe("world-1",);
    expect(scoped._myActorId,).toBe("me",);
    expect(inventoryOffers._worldId,).toBeNull();
  });
});
