// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { InventoryItem, } from "../inventory/inventory-grid";
import { inventoryTrading, inventoryTradingFactory, stateFromTradeActors, } from "./inventory-trading";

// ── Mock apiFetch (inventory-trading imports ./htmx) ──
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

const steelSword = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "steel-sword",
  name: "Steel Sword",
  itemType: "weapon",
  rarity: "uncommon",
  quantity: 1,
  value: 100,
  ...overrides,
});

afterEach(() => {
  calls = [];
  handler = async () => Response.json({ data: [], },);
},);

describeOrSkip("inventory trading state", () => {
  test("load pulls player-owned and NPC-owned world instances", async () => {
    handler = async (url: string,) => {
      if (url === "/api/v1/worlds/world-1/item-instances") {
        return Response.json([
          { id: "inst-player", item_id: "sword", quantity: 2, owner_actor_id: "player-1", },
          { id: "inst-1", item_id: "steel-sword", quantity: 1, owner_actor_id: "npc-1", },
          { id: "stray", item_id: "sword", quantity: 1, owner_actor_id: "someone-else", },
        ],);
      }

      if (url.startsWith("/api/v1/worlds/world-1/items",)) {
        return Response.json({ data: [sword(), steelSword(),], },);
      }

      return Response.json({ data: [], },);
    };

    const state = stateFromTradeActors("world-1", "player-1", "npc-1",);
    await state.load();
    await flush();
    expect(state.playerItems.map((item,) => item.id),).toEqual(["inst-player",],);
    expect(state.npcItems.map((item,) => item.id),).toEqual(["inst-1",],);
    expect(state.playerLoadError,).toBe("",);
    expect(state.npcLoadError,).toBe("",);
    expect(state.playerLoading,).toBe(false,);
    expect(state.npcLoading,).toBe(false,);
  });

  test("toggle ignores unknown ids; summary totals the draft", () => {
    const state = stateFromTradeActors("world-1", "player-1", "npc-1",);
    state.playerItems = [sword(),];
    state.npcItems = [steelSword(),];
    state.toggle("player", "nope",);
    expect(state.draft,).toEqual({ playerIds: [], npcIds: [], },);
    state.toggle("player", "sword",);
    state.toggle("npc", "steel-sword",);
    expect(state.summary(),).toMatchObject({ playerValue: 50, npcValue: 100, net: -50, },);
    state.clearDraft();
    expect(state.draft,).toEqual({ playerIds: [], npcIds: [], },);
  });

  test("buyFromNpc posts the NPC route with listed price then refetches", async () => {
    const seen: { url: string; opts: RequestInit }[] = [];
    handler = async (url: string, opts?: RequestInit,) => {
      seen.push({ url, opts: opts ?? {}, },);
      if (url === "/api/v1/worlds/world-1/item-instances") {
        return Response.json([],);
      }

      return Response.json({ ok: true, },);
    };

    const state = stateFromTradeActors("world-1", "player-1", "npc-1",);
    state.npcItems = [steelSword(),];
    state.toggle("npc", "steel-sword",);
    await state.buyFromNpc();
    await flush();
    const buy = seen.find((call,) => call.url.endsWith("/trade/buy-from-npc",));
    expect(buy?.url,).toBe("/api/v1/worlds/world-1/trade/buy-from-npc",);
    expect(buy?.opts.method,).toBe("POST",);
    expect(JSON.parse(String(buy?.opts.body ?? "{}",) as string,),).toEqual({
      buyerActorId: "player-1",
      npcActorId: "npc-1",
      sellerItems: [{ worldItemId: "steel-sword", quantity: 1, },],
      price: 100,
    },);

    expect(state.draft.npcIds,).toEqual([],);
    expect(state.message.length > 0,).toBe(true,);
    expect(state.error,).toBe("",);
  });

  test("sellToNpc posts the NPC route; confirm splits mixed drafts", async () => {
    const seen: string[] = [];
    handler = async (url: string,) => {
      seen.push(url,);
      if (url === "/api/v1/worlds/world-1/item-instances") {
        return Response.json([
          { id: "inst-player", item_id: "sword", quantity: 1, owner_actor_id: "player-1", },
          { id: "inst-9", item_id: "steel-sword", quantity: 1, owner_actor_id: "npc-1", },
        ],);
      }

      if (url.startsWith("/api/v1/worlds/world-1/items",)) {
        return Response.json({ data: [sword(), steelSword(),], },);
      }

      return Response.json(
        url.endsWith("/trade/buy-from-npc",) || url.endsWith("/trade/sell-to-npc",)
          ? { ok: true, }
          : { data: [], },
      );
    };

    const state = stateFromTradeActors("world-1", "player-1", "npc-1",);
    state.playerItems = [{ ...sword(), id: "inst-player", },];
    state.npcItems = [{ ...steelSword(), id: "inst-9", },];
    state.toggle("player", "inst-player",);
    await state.sellToNpc();
    await flush();
    const sell = seen.find((url,) => url.endsWith("/trade/sell-to-npc",));
    expect(sell,).toBe("/api/v1/worlds/world-1/trade/sell-to-npc",);
    expect(state.draft.playerIds,).toEqual([],);

    state.toggle("player", "inst-player",);
    state.toggle("npc", "inst-9",);
    seen.length = 0;
    await state.confirm();
    await flush();
    expect(seen.filter((url,) => url.endsWith("/trade/sell-to-npc",)).length,).toBe(1,);
    expect(seen.filter((url,) => url.endsWith("/trade/buy-from-npc",)).length,).toBe(1,);
    expect(state.draft,).toEqual({ playerIds: [], npcIds: [], },);
  });

  test("trade failures surface via error without clearing the draft", async () => {
    handler = async (url: string,) => {
      if (url.endsWith("/trade/buy-from-npc",)) {
        return Response.json({ message: "broke", }, { status: 400, },);
      }

      return Response.json({ data: [], },);
    };

    const state = stateFromTradeActors("world-1", "player-1", "npc-1",);
    state.npcItems = [steelSword(),];
    state.toggle("npc", "steel-sword",);
    await state.buyFromNpc();
    await flush();
    expect(state.error.length > 0,).toBe(true,);
    expect(state.draft.npcIds,).toEqual(["steel-sword",],);
  });

  test("sell sends world-item instance ids, not character-sheet ids", async () => {
    const seen: { url: string; body: string }[] = [];
    handler = async (url: string, opts?: RequestInit,) => {
      if (url.endsWith("/trade/sell-to-npc",)) {
        seen.push({ url, body: String(opts?.body ?? "",), },);
        return Response.json({ ok: true, },);
      }

      if (url === "/api/v1/worlds/world-1/item-instances") {
        return Response.json([{ id: "inst-player", item_id: "sword", quantity: 2, owner_actor_id: "player-1", },],);
      }

      if (url.startsWith("/api/v1/worlds/world-1/items",)) {
        return Response.json({ data: [sword(),], },);
      }

      return Response.json({ data: [], },);
    };

    const state = stateFromTradeActors("world-1", "player-1", "npc-1",);
    await state.load();
    await flush();
    // The player row is the world-item instance the NPC route can resolve.
    expect(state.playerItems.map((item,) => item.id),).toEqual(["inst-player",],);

    state.toggle("player", "inst-player",);
    await state.sellToNpc();
    await flush();
    expect(JSON.parse(seen[0]?.body ?? "{}",),).toEqual({
      sellerActorId: "player-1",
      npcActorId: "npc-1",
      buyerItems: [{ worldItemId: "inst-player", quantity: 2, },],
      price: 100,
    },);
  });

  test("confirm is a no-op on an empty draft; setTradeActors resets", () => {
    const state = stateFromTradeActors("world-1", "player-1", "npc-1",);
    state.playerItems = [sword(),];
    state.confirm();
    expect(state.error,).toBe("",);
    state.toggle("player", "sword",);
    state.setTradeActors("world-2", "player-2", "npc-2",);
    expect(state.draft,).toEqual({ playerIds: [], npcIds: [], },);
    expect(state.playerItems,).toEqual([],);
    expect(state._worldId,).toBe("world-2",);
  });
},);

describe("inventory trading scope", () => {
  test("inventoryTradingFactory scopes a panel to one triple", () => {
    const state = inventoryTradingFactory("world-1", "player-1", "npc-1",);
    expect(state._worldId,).toBe("world-1",);
    expect(state._playerActorId,).toBe("player-1",);
    expect(state._npcActorId,).toBe("npc-1",);
    expect(state.summary(),).toMatchObject({ playerValue: 0, npcValue: 0, net: 0, },);
  });

  test("the shared inventoryTrading scope starts actor-less", () => {
    expect(inventoryTrading._worldId,).toBeNull();
    expect(inventoryTrading.playerItems,).toEqual([],);
  });
});
