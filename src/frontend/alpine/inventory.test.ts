// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { InventoryItem, } from "../inventory/inventory-grid";
import { inventory, inventoryFactory, stateFromActor, } from "./inventory";

// ── Mock apiFetch (inventory imports ./htmx) ──
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
  ...overrides,
});

const potion = (overrides: Partial<InventoryItem> = {},): InventoryItem => ({
  id: "potion",
  name: "Health Potion",
  itemType: "consumable",
  rarity: "uncommon",
  quantity: 3,
  ...overrides,
});

afterEach(() => {
  calls = [];
  handler = async () => Response.json({ data: [], },);
},);

describeOrSkip("inventory state", () => {
  test("load pulls the actor item list and clears gone selections", async () => {
    handler = async (url: string,) => {
      if (url === "/api/v1/actors/actor-1/items") {
        return Response.json({ data: [sword(), potion(),], },);
      }

      return Response.json({ data: [], },);
    };

    const state = stateFromActor("actor-1",);
    state.selectedId = "gone";
    await state.load();
    await flush();
    expect(state.items.map((item,) => item.id),).toEqual(["sword", "potion",],);
    expect(state.selectedId,).toBeNull();
    expect(state.loading,).toBe(false,);
    expect(state.loadError,).toBe("",);
  });

  test("load surfaces failures via loadError", async () => {
    handler = async () => Response.json({ message: "nope", }, { status: 500, },);
    const state = stateFromActor("actor-1",);
    await state.load();
    await flush();
    expect(state.loadError.length > 0,).toBe(true,);
    expect(state.loading,).toBe(false,);
  });

  test("visibleItems applies filter + sort; select ignores unknown ids", () => {
    const state = stateFromActor("actor-1",);
    state.items = [sword(), potion(),];
    state.sort = "rarity";
    expect(state.visibleItems().map((item,) => item.id),).toEqual(["potion", "sword",],);
    state.usableOnly = true;
    expect(state.visibleItems().map((item,) => item.id),).toEqual(["potion",],);
    state.select("nope",);
    expect(state.selectedId,).toBeNull();
    state.select("sword",);
    expect(state.selectedItem()?.id,).toBe("sword",);
  });

  test("toggleView flips grid/list", () => {
    const state = stateFromActor();
    state.toggleView();
    expect(state.view,).toBe("list",);
    state.toggleView();
    expect(state.view,).toBe("grid",);
  });

  test("equip posts then reloads; invalid transfer quantity short-circuits", async () => {
    const seen: string[] = [];
    handler = async (url: string,) => {
      seen.push(url,);
      return Response.json({ data: [sword({ equipped: "equipped", },),], },);
    };

    const state = stateFromActor("actor-1",);
    await state.equip("sword",);
    await flush();
    expect(seen[0],).toBe("/api/v1/actors/actor-1/items/sword/equip",);
    expect(seen,).toContain("/api/v1/actors/actor-1/items",);
    expect(state.error,).toBe("",);

    seen.length = 0;
    await state.transfer({ itemId: "sword", toActorId: "actor-2", quantity: 0, },);
    expect(seen,).toEqual([],);
    expect(state.error.length > 0,).toBe(true,);
  });

  test("unequip/drop/transfer hit their routes and reload", async () => {
    const seen: { url: string; opts: RequestInit }[] = [];
    handler = async (url: string, opts?: RequestInit,) => {
      seen.push({ url, opts: opts ?? {}, },);
      return Response.json({ data: [], },);
    };

    const state = stateFromActor("actor-1",);
    await state.unequip("sword",);
    await state.drop("sword",);
    await state.transfer({ itemId: "sword", toActorId: "actor-2", quantity: 2, },);
    await flush();
    expect(seen[0]?.url,).toBe("/api/v1/actors/actor-1/items/sword/unequip",);
    expect(seen[0]?.opts.method,).toBe("POST",);
    expect(seen[3]?.url,).toBe("/api/v1/actors/actor-1/items/sword",);
    expect(seen[3]?.opts.method,).toBe("DELETE",);
    expect(seen[6]?.url,).toBe("/api/v1/actors/actor-1/items/sword/transfer",);
    expect(JSON.parse(String(seen[6]?.opts.body ?? "{}",) as string,),).toEqual({
      toActorId: "actor-2",
      quantity: 2,
    },);
  });

  test("loadEquipped pulls snake_case rows; equip refreshes both lists", async () => {
    const seen: string[] = [];
    handler = async (url: string,) => {
      seen.push(url,);
      if (url === "/api/v1/actors/actor-1/items/equipped") {
        return Response.json([{ id: "sword", name: "Iron Sword", item_type: "weapon", equipped: "equipped", },],);
      }

      return Response.json({ data: [], },);
    };

    const state = stateFromActor("actor-1",);
    await state.loadEquipped();
    await flush();
    expect(state.equipped.map((item,) => item.id),).toEqual(["sword",],);
    expect(state.equipped[0]?.itemType,).toBe("weapon",);
    expect(state.equippedLoading,).toBe(false,);
    expect(state.equippedError,).toBe("",);

    seen.length = 0;
    await state.equip("sword",);
    await flush();
    expect(seen,).toContain("/api/v1/actors/actor-1/items/equipped",);
  });

  test("loadEquipped surfaces failures via equippedError", async () => {
    handler = async () => Response.json({ message: "nope", }, { status: 500, },);
    const state = stateFromActor("actor-1",);
    await state.loadEquipped();
    await flush();
    expect(state.equippedError.length > 0,).toBe(true,);
    expect(state.equippedLoading,).toBe(false,);
    expect(state.equipped,).toEqual([],);
  });

  test("setActorId clears equipped rows", () => {
    const state = stateFromActor("actor-1",);
    state.equipped = [sword(),];
    state.setActorId("actor-2",);
    expect(state.equipped,).toEqual([],);
  });
},);

describe("inventory scope", () => {
  test("inventoryFactory scopes a panel to one actor", () => {
    const state = inventoryFactory("actor-9",);
    expect(state._invActorId,).toBe("actor-9",);
    expect(state.items,).toEqual([],);
    expect(state.visibleItems(),).toEqual([],);
  });

  test("the shared inventory scope starts actor-less", () => {
    expect(inventory._invActorId,).toBeNull();
    expect(inventory.items,).toEqual([],);
  });
});
