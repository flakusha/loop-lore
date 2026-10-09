// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { locationDetails, } from "./location-details";
import type { WorldLocationDetail, WorldPageState, } from "./world-types";

// Bare-global apiFetch/showToast pattern (mirrors world-locations.test.ts).
const g = globalThis as unknown as {
  apiFetch?: (url: string | URL, opts?: RequestInit,) => Promise<Response>;
};

// `g.apiFetch` is shared with every other suite in this worker, so the prior
// value is captured in `beforeEach` — immediately before we overwrite — and
// handed back verbatim in `afterEach`. Capturing at module scope would let
// this file delete a stub another file installed at import time.
let originalApiFetch: typeof g.apiFetch;

let fetchCalls: string[] = [];
let fetchHandler: ((url: string,) => Response | Promise<Response>) | null = null;

const WORLD_ID = "w1";
const LOC_ID = "loc1";

/** A live-getter view over a slice: prototype chain keeps `this` working.
 * Only DATA fields belong here — stubbing a slice method would shadow the
 * real one and make a test pass without ever exercising it. */
const asState = (slice: object, over: object,): WorldPageState =>
  Object.assign(Object.create(slice,), over,) as WorldPageState;

function ctx(overrides?: object,): WorldPageState {
  return asState(locationDetails, {
    worldId: WORLD_ID,
    selectedLocationId: "",
    detail: null,
    detailLoading: false,
    detailError: false,
    detailNpcs: [],
    showItems: false,
    ...overrides,
  },);
}

const detail = (over: Partial<WorldLocationDetail> = {},): WorldLocationDetail => ({
  id: LOC_ID,
  name: "Town",
  description: "hub",
  parent_location_id: null,
  parent: null,
  connections: [],
  state: {
    description_override: null,
    atmosphere: null,
    npcs_present: "[]",
    items_available: "[]",
    time_of_day: null,
    weather: null,
    hazards: "[]",
  },
  ...over,
});

/** detail + npcs feeds, keyed by the request path they answer. */
function feeds(opts: { detail?: unknown; npcs?: unknown; detailStatus?: number; npcsStatus?: number },): void {
  fetchHandler = (url: string,) => {
    if (url.endsWith(`/locations/${LOC_ID}/details`,)) {
      const status = opts.detailStatus ?? 200;
      if (status !== 200) { return new Response("no", { status, },); }
      return Response.json(opts.detail ?? { data: detail(), },);
    }

    if (url.endsWith(`/npcs-at/${LOC_ID}`,)) {
      const status = opts.npcsStatus ?? 200;
      if (status !== 200) { return new Response("no", { status, },); }
      return Response.json(opts.npcs ?? [{ actorId: "a1", displayName: "Goblin", },],);
    }

    return new Response("unexpected", { status: 404, },);
  };
}

beforeEach(() => {
  originalApiFetch = g.apiFetch;

  fetchCalls = [];
  fetchHandler = null;
  g.apiFetch = async (url: string | URL,) => {
    fetchCalls.push(String(url,),);
    if (!fetchHandler) { return new Response("{}", { status: 500, },); }
    return fetchHandler(String(url,),);
  };
},);

afterEach(() => {
  fetchHandler = null;
  g.apiFetch = originalApiFetch;
},);

describe("locationDetails.loadLocationDetail", () => {
  test("loads the detail and the NPC list for the selected location", async () => {
    feeds({ detail: { data: detail({ name: "Deep Cavern", },), }, },);
    const c = ctx();

    await c.loadLocationDetail(LOC_ID,);

    expect(c.detail?.name,).toBe("Deep Cavern",);
    expect(c.detailNpcs,).toEqual([{ actorId: "a1", displayName: "Goblin", },],);
    expect(c.detailError,).toBe(false,);
    expect(c.detailLoading,).toBe(false,);
    expect(fetchCalls,).toEqual([
      `/api/v1/worlds/${WORLD_ID}/locations/${LOC_ID}/details`,
      `/api/v1/worlds/${WORLD_ID}/npcs-at/${LOC_ID}`,
    ],);
  });

  test("flags an error and keeps the old detail when the detail feed fails", async () => {
    feeds({ detailStatus: 404, },);
    const c = ctx({ detail: detail({ name: "Previous", },), },);

    await c.loadLocationDetail(LOC_ID,);

    expect(c.detailError,).toBe(true,);
    expect(c.detail?.name,).toBe("Previous",);
    expect(c.detailLoading,).toBe(false,);
  });

  test("flags an error when only the NPC feed fails", async () => {
    feeds({ npcsStatus: 500, },);
    const c = ctx();

    await c.loadLocationDetail(LOC_ID,);

    expect(c.detailError,).toBe(true,);
    expect(c.detailNpcs,).toEqual([],);
  });

  test("a 200 with no data yields no detail rather than a phantom one", async () => {
    feeds({ detail: { data: null, }, },);
    const c = ctx();

    await c.loadLocationDetail(LOC_ID,);

    expect(c.detail,).toBeNull();
    expect(c.detailError,).toBe(false,);
  });

  test("an unknown location id surfaces as an error", async () => {
    feeds({},);
    const c = ctx();

    // The server 404s a location id that is not in this world.
    await c.loadLocationDetail("loc-from-another-world",);

    expect(c.detailError,).toBe(true,);
    expect(c.detailLoading,).toBe(false,);
    expect(c.detail,).toBeNull();
  });

  test("clears a stale error flag when a later attempt succeeds", async () => {
    feeds({},);
    const c = ctx({ detailError: true, },);

    await c.loadLocationDetail(LOC_ID,);

    expect(c.detailError,).toBe(false,);
  });

  test("keeps the error flag set when a retry also fails", async () => {
    feeds({ detailStatus: 503, },);
    const c = ctx({ detailError: true, },);

    await c.loadLocationDetail(LOC_ID,);

    expect(c.detailError,).toBe(true,);
  });

  test("a non-array NPC payload collapses to an empty list", async () => {
    feeds({ npcs: { oops: true, }, },);
    const c = ctx();

    await c.loadLocationDetail(LOC_ID,);

    expect(c.detailNpcs,).toEqual([],);
    expect(c.detailError,).toBe(false,);
  });

  test("flags an error when the request throws outright", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };

    const c = ctx();

    await c.loadLocationDetail(LOC_ID,);

    expect(c.detailError,).toBe(true,);
    expect(c.detailLoading,).toBe(false,);
  });

  test("makes no request without a world id", async () => {
    const c = ctx({ worldId: null, },);
    await c.loadLocationDetail(LOC_ID,);

    expect(fetchCalls,).toEqual([],);
    expect(c.detailLoading,).toBe(false,);
  });
});

describe("locationDetails.selectLocation", () => {
  test("selects, resets the items panel and loads the detail", async () => {
    feeds({ detail: { data: detail({ name: "Cave", },), }, },);
    const c = ctx({ showItems: true, },);

    await c.selectLocation(LOC_ID,);

    expect(c.selectedLocationId,).toBe(LOC_ID,);
    expect(c.showItems,).toBe(false,);
    expect(c.detail?.name,).toBe("Cave",);
  });

  test("re-selecting the same location does not refetch", async () => {
    feeds({},);
    const c = ctx({ selectedLocationId: LOC_ID, detail: detail(), },);

    await c.selectLocation(LOC_ID,);

    expect(fetchCalls,).toEqual([],);
    expect(c.detail?.name,).toBe("Town",);
  });

  test("re-selecting after an error does refetch", async () => {
    feeds({ detail: { data: detail({ name: "Recovered", },), }, },);
    // Same id selected, but no detail yet — the guard must not short-circuit.
    const c = ctx({ selectedLocationId: LOC_ID, detail: null, detailError: true, },);

    await c.selectLocation(LOC_ID,);

    expect(fetchCalls.length,).toBeGreaterThan(0,);
    expect(c.detail?.name,).toBe("Recovered",);
  });

  test("switching location replaces the previous detail", async () => {
    feeds({ detail: { data: detail({ name: "Second", },), }, },);
    const c = ctx({ selectedLocationId: "loc-old", detail: detail({ name: "First", },), },);

    await c.selectLocation(LOC_ID,);

    expect(c.selectedLocationId,).toBe(LOC_ID,);
    expect(c.detail?.name,).toBe("Second",);
  });
});

describe("locationDetails state projections", () => {
  test("detailHazards reads the stored JSON list", () => {
    const c = ctx({
      detail: detail({
        state: {
          description_override: null,
          atmosphere: null,
          npcs_present: "[]",
          items_available: "[]",
          time_of_day: null,
          weather: null,
          hazards: '["flood","fire"]',
        },
      },),
    },);

    expect(c.detailHazards,).toEqual(["flood", "fire",],);
  });

  test("detailItems reads the stored JSON list", () => {
    const c = ctx({
      detail: detail({
        state: {
          description_override: null,
          atmosphere: null,
          npcs_present: "[]",
          items_available: '["sword"]',
          time_of_day: null,
          weather: null,
          hazards: "[]",
        },
      },),
    },);

    expect(c.detailItems,).toEqual(["sword",],);
  });

  test("malformed hazard JSON degrades to an empty list, never throws", () => {
    const c = ctx({
      detail: detail({
        state: {
          description_override: null,
          atmosphere: null,
          npcs_present: "[]",
          items_available: "[]",
          time_of_day: null,
          weather: null,
          hazards: "{not json",
        },
      },),
    },);

    expect(c.detailHazards,).toEqual([],);
  });

  test("a location with no state yields empty projections", () => {
    const c = ctx({ detail: detail({ state: null, },), },);
    expect(c.detailHazards,).toEqual([],);
    expect(c.detailItems,).toEqual([],);
  });

  test("no detail selected yields empty projections", () => {
    const c = ctx();
    expect(c.detailHazards,).toEqual([],);
    expect(c.detailItems,).toEqual([],);
  });
});
