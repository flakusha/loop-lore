// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { worldLocations, } from "./world-locations";
import type { WorldEditState, } from "./world-types";

// Bare-global apiFetch/showToast/confirm pattern (mirrors world-items.test.ts):
// world-locations.ts has no htmx import, so stub the globals directly.
const g = globalThis as unknown as {
  apiFetch?: (url: string | URL, opts?: RequestInit,) => Promise<Response>;
  showToast?: (...args: unknown[]) => void;
};
const originalApiFetch = g.apiFetch;
const originalShowToast = g.showToast;
const originalConfirm = globalThis.confirm;

let fetchCalls: { url: string; opts?: RequestInit }[] = [];
let fetchHandler: ((url: string, opts?: RequestInit,) => Response) | null = null;

function ctx(overrides?: Partial<WorldEditState>,): WorldEditState {
  return {
    ...(worldLocations as unknown as WorldEditState),
    worldId: "w1",
    ...overrides,
  } as WorldEditState;
}

function mockFetch(status: number, body: unknown = {},): void {
  fetchHandler = () => Response.json(body, { status, },);
}

beforeEach(() => {
  fetchCalls = [];
  fetchHandler = null;
  g.apiFetch = async (url: string | URL, opts?: RequestInit,) => {
    fetchCalls.push({ url: String(url,), opts, },);
    if (!fetchHandler) { return new Response("{}", { status: 500, },); }
    return fetchHandler(String(url,), opts ?? {},);
  };
  g.showToast = () => {};
  globalThis.confirm = () => true;
},);

afterEach(() => {
  fetchHandler = null;
  g.apiFetch = originalApiFetch;
  g.showToast = originalShowToast;
  globalThis.confirm = originalConfirm;
},);

describe("worldLocations.loadLocations", () => {
  test("maps rows and marks loaded", async () => {
    mockFetch(200, {
      data: [{ id: "l1", name: "Town", description: "hub", parent_location_id: null, connections: ["l2",], },],
    },);
    const c = ctx();
    await c.loadLocations();
    expect(c.locations,).toHaveLength(1,);
    expect(c.locations[0],).toMatchObject({ id: "l1", name: "Town", },);
    expect((c.locations[0] as unknown as { connections: unknown[] }).connections,).toEqual(["l2",],);
    expect(c.locationsLoaded,).toBe(true,);
    expect(c.loadingLocations,).toBe(false,);
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/locations",);
  });

  test("defaults missing connections to empty list", async () => {
    mockFetch(200, { data: [{ id: "l1", name: "Town", description: null, parent_location_id: null, },], },);
    const c = ctx();
    await c.loadLocations();
    expect((c.locations[0] as unknown as { connections: unknown[] }).connections,).toEqual([],);
  });

  test("keeps stale rows on failure", async () => {
    mockFetch(500, {},);
    const c = ctx();
    await c.loadLocations();
    expect(c.locations,).toHaveLength(0,);
    expect(c.locationsLoaded,).toBe(false,);
    expect(c.loadingLocations,).toBe(false,);
  });

  test("tolerates malformed payloads", async () => {
    mockFetch(200, { data: null, },);
    const c = ctx();
    await c.loadLocations();
    expect(c.locations,).toEqual([],);
  });
});

describe("worldLocations.addLocation", () => {
  test("ignores blank names", async () => {
    const c = ctx({ newLocName: "   ", },);
    await c.addLocation();
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("POSTs the form and reloads", async () => {
    mockFetch(201, { id: "l2", },);
    const c = ctx({ newLocName: "Tavern", newLocDesc: "cozy", newLocParentId: "l1", newLocConnections: ["l1",], },);
    await c.addLocation();
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/locations",);
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toMatchObject({
      name: "Tavern",
      parentLocationId: "l1",
    },);
    expect(c.newLocName,).toBe("",);
    expect(c.newLocConnections,).toEqual([],);
  });

  test("surfaces server errors without clearing the form", async () => {
    mockFetch(400, { error: "bad", },);
    const c = ctx({ newLocName: "Tavern", },);
    await c.addLocation();
    expect(c.newLocName,).toBe("Tavern",);
  });
});

describe("worldLocations.expandLoc", () => {
  const loc = { id: "l1", name: "Town", description: "hub", parent_location_id: null, };

  test("expands and populates edit fields", () => {
    const c = ctx({ locations: [loc,], expandedLoc: "", editLocName: "", editLocDesc: "", },);
    c.expandLoc("l1",);
    expect(c.expandedLoc,).toBe("l1",);
    expect(c.editLocName,).toBe("Town",);
    expect(c.editLocDesc,).toBe("hub",);
  });

  test("collapses when the same location is toggled", () => {
    const c = ctx({ locations: [loc,], expandedLoc: "l1", },);
    c.expandLoc("l1",);
    expect(c.expandedLoc,).toBe("",);
  });

  test("expanding an unknown id clears nothing and sets the id", () => {
    const c = ctx({ locations: [loc,], expandedLoc: "", editLocName: "keep", },);
    c.expandLoc("missing",);
    expect(c.expandedLoc,).toBe("missing",);
    expect(c.editLocName,).toBe("keep",);
  });

  test("null descriptions become empty strings", () => {
    const c = ctx({
      locations: [{ id: "l1", name: "Town", description: null, parent_location_id: null, },],
      expandedLoc: "",
      editLocDesc: "old",
    },);
    c.expandLoc("l1",);
    expect(c.editLocDesc,).toBe("",);
  });
});

describe("worldLocations.saveLocation", () => {
  test("PUTs trimmed fields and updates the local row", async () => {
    mockFetch(200, {},);
    const c = ctx({
      locations: [{ id: "l1", name: "Town", description: "hub", parent_location_id: null, },],
      expandedLoc: "l1",
      editLocName: "  New Town  ",
      editLocDesc: "  ",
    },);
    await c.saveLocation("l1",);
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/locations/l1",);
    expect(JSON.parse(fetchCalls[0]!.opts?.body as string,),).toEqual({
      name: "New Town",
      description: null,
    },);
    expect(c.locations[0]!.name,).toBe("New Town",);
    expect(c.expandedLoc,).toBe("",);
  });

  test("handles unicode names", async () => {
    mockFetch(200, {},);
    const c = ctx({
      locations: [{ id: "l1", name: "x", description: null, parent_location_id: null, },],
      expandedLoc: "l1",
      editLocName: "酒場・影",
      editLocDesc: "灯り",
    },);
    await c.saveLocation("l1",);
    expect(c.locations[0]!.name,).toBe("酒場・影",);
  });
});

describe("worldLocations.deleteLocation", () => {
  test("DELETEs and reloads", async () => {
    mockFetch(200, { data: [], },);
    const c = ctx();
    await c.deleteLocation("l1",);
    expect(fetchCalls[0]!.url,).toBe("/api/worlds/w1/locations/l1",);
    expect(fetchCalls[0]!.opts?.method,).toBe("DELETE",);
  });

  test("aborts when confirm is declined", async () => {
    globalThis.confirm = () => false;
    const c = ctx();
    await c.deleteLocation("l1",);
    expect(fetchCalls,).toHaveLength(0,);
  });
});
