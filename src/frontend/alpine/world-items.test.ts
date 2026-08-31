import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { worldItems, } from "./world-items";
import type { WorldEditState, } from "./world-types";

// The mixin's methods rely on browser globals (apiFetch / showToast / confirm).
// `apiFetch` is used as a declared global (loaders.d.ts sets `var apiFetch`) which
// htmx.ts wires at runtime via `globalThis.apiFetch` — so stub that global directly
// (mock.module only intercepts module imports; world-items.ts has no import).
const fetchCalls: { url: string; opts?: RequestInit }[] = [];
let fetchHandler: ((url: string, opts?: RequestInit,) => Response) | null = null;

const originalApiFetch = (globalThis as Record<string, unknown>).apiFetch;
const originalShowToast = (globalThis as Record<string, unknown>).showToast;
const originalConfirm = globalThis.confirm;

/**
 * @param overrides
 */
function ctx(overrides?: Partial<WorldEditState>,): WorldEditState {
  return {
    ...(worldItems as WorldEditState),
    worldId: "w1",
    ...overrides,
  };
}

/**
 * @param status
 * @param body
 */
function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = (_url: string, _opts?: RequestInit,) => Response.json(body, { status, },);
}

beforeEach(() => {
  fetchCalls.length = 0;
  fetchHandler = null;
  (globalThis as Record<string, unknown>).apiFetch = async (url: string | URL, opts?: RequestInit,) => {
    fetchCalls.push({ url: String(url,), opts, },);
    if (!fetchHandler) { return new Response("{}", { status: 500, },); }
    return fetchHandler(String(url,), opts ?? {},);
  };
  (globalThis as Record<string, unknown>).showToast = () => {
    /* noop — toast assertions not needed for these paths */
  };
  globalThis.confirm = () => true;
},);

afterEach(() => {
  fetchHandler = null;
  (globalThis as Record<string, unknown>).apiFetch = originalApiFetch;
  (globalThis as Record<string, unknown>).showToast = originalShowToast;
  globalThis.confirm = originalConfirm;
},);

const sampleItems = {
  data: [
    {
      id: "item-1",
      name: "Iron Sword",
      description: "A sturdy blade",
      category: "weapon",
      rarity: "uncommon",
      value: 120,
      weight: 3,
      stackable: false,
      max_stack: 1,
      properties: null,
    },
  ],
};

describe("worldItems.loadItems", () => {
  test("maps data.data into item definitions", async () => {
    mockFetch(200, sampleItems,);
    const c = ctx();
    await c.loadItems();
    expect(c.items,).toHaveLength(1,);
    expect(c.items[0],).toMatchObject({
      id: "item-1",
      name: "Iron Sword",
      category: "weapon",
      rarity: "uncommon",
      value: 120,
      weight: 3,
    },);
    expect(c.itemsLoaded,).toBe(true,);
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/items",);
  });

  test("sets itemsLoaded only on success", async () => {
    mockFetch(500, {},);
    const c = ctx();
    await c.loadItems();
    expect(c.items,).toHaveLength(0,);
    expect(c.itemsLoaded,).toBe(false,);
  });
});

describe("worldItems.addItem", () => {
  test("POSTs trimmed payload and reloads", async () => {
    mockFetch(201, { id: "item-2", },);
    const c = ctx({ newItemName: "  Potion  ", newItemCategory: "consumable", newItemRarity: "common", },);
    await c.addItem();
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/items",);
    expect(fetchCalls[0]!.opts?.method,).toBe("POST",);
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toMatchObject({
      name: "Potion",
      category: "consumable",
      rarity: "common",
    },);
    expect(c.newItemName,).toBe("",);
    expect(JSON.stringify(fetchCalls.map((f,) => f.url),),).toContain("/api/worlds/w1/items",);
  });

  test("ignores empty name", async () => {
    const c = ctx({ newItemName: "", },);
    await c.addItem();
    expect(fetchCalls,).toHaveLength(0,);
  });
});

describe("worldItems.saveItem", () => {
  test("PUTs updated fields and reloads", async () => {
    mockFetch(200, sampleItems.data[0],);
    const c = ctx({
      items: [{ ...(sampleItems.data[0] as (typeof sampleItems.data)[0]), },],
      expandedItem: "item-1",
      editItemName: "Iron Sword X",
      editItemCategory: "weapon",
      editItemRarity: "rare",
      editItemValue: "150",
      editItemWeight: "2",
    },);
    await c.saveItem("item-1",);
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/items/item-1",);
    expect(fetchCalls[0]!.opts?.method,).toBe("PUT",);
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toMatchObject({
      name: "Iron Sword X",
      rarity: "rare",
      value: 150,
      weight: 2,
    },);
  });
});

describe("worldItems.expandItem", () => {
  test("populates edit fields from the matching item", () => {
    const c = ctx({ items: [{ ...(sampleItems.data[0] as (typeof sampleItems.data)[0]), },], },);
    c.expandItem("item-1",);
    expect(c.expandedItem,).toBe("item-1",);
    expect(c.editItemName,).toBe("Iron Sword",);
    expect(c.editItemCategory,).toBe("weapon",);
    expect(c.editItemValue,).toBe("120",);
  });

  test("toggling collapse clears expandedItem", () => {
    const c = ctx({ items: [{ ...(sampleItems.data[0] as (typeof sampleItems.data)[0]), },], },);
    c.expandItem("item-1",);
    c.expandItem("item-1",);
    expect(c.expandedItem,).toBe("",);
  });
});

describe("worldItems.deleteItem", () => {
  test("DELETEs and reloads on confirm", async () => {
    mockFetch(200, {},);
    const c = ctx({ items: [{ ...(sampleItems.data[0] as (typeof sampleItems.data)[0]), },], },);
    await c.deleteItem("item-1",);
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/items/item-1",);
    expect(fetchCalls[0]!.opts?.method,).toBe("DELETE",);
  });
});

describe("worldItems.loadInstances", () => {
  test("maps placed instances", async () => {
    mockFetch(200, [
      { id: "inst-1", item_id: "item-1", location_id: "loc-1", quantity: 3, visibility: "visible", created_at: "t", },
      { id: "inst-2", item_id: "item-1", location_id: null, quantity: 1, visibility: "visible", created_at: "t", },
    ],);
    const c = ctx();
    await c.loadInstances("item-1",);
    expect(c.instances,).toHaveLength(2,);
    expect(c.instances[0],).toMatchObject({ id: "inst-1", location_id: "loc-1", quantity: 3, },);
    expect(c.instances[1]!.location_id,).toBeNull();
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/items/item-1/instances",);
    expect(c.instancesLoaded,).toBe(true,);
  });

  test("locName resolves a placement location name", () => {
    const c = ctx();
    c.locations = [{ id: "loc-1", name: "Darkwood", description: null, parent_location_id: null, },];
    expect(c.locName("loc-1",),).toBe("Darkwood",);
    expect(c.locName(null,),).toBe("—",);
    expect(c.locName("nope",),).toBe("(unknown)",);
  });
});

describe("worldItems.placeInstance", () => {
  test("POSTs itemId/locationId/quantity and reloads", async () => {
    mockFetch(201, { id: "inst-1", },);
    const c = ctx({
      placeLocationId: "loc-1",
      placeQuantity: "5",
      locations: [{ id: "loc-1", name: "Darkwood", description: null, parent_location_id: null, },],
    },);
    await c.placeInstance("item-1",);
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/item-instances",);
    expect(fetchCalls[0]!.opts?.method,).toBe("POST",);
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toMatchObject({
      itemId: "item-1",
      locationId: "loc-1",
      quantity: 5,
    },);
    expect(c.placeQuantity,).toBe("1",);
  });
});

describe("worldItems.destroyInstance", () => {
  test("DELETEs and reloads for the current expanded item", async () => {
    mockFetch(200, {},);
    const c = ctx({ expandedItem: "item-1", },);
    await c.destroyInstance("inst-1",);
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/item-instances/inst-1",);
    expect(fetchCalls[0]!.opts?.method,).toBe("DELETE",);
    expect(fetchCalls.map((f,) => f.url),).toContain("/api/worlds/w1/items/item-1/instances",);
  });
});
