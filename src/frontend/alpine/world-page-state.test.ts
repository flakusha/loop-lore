// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { parseJsonList, } from "../../utils/safe-json";
import { locationActions, } from "./location-actions";
import { locationDetails, } from "./location-details";
import { timeWeatherWidget, } from "./time-weather";
import { travelInterface, } from "./travel-interface";
import { buildWorldPageState, } from "./world";
import type { WorldLocationLite, WorldPageState, } from "./world-types";

const loc = (id: string, x: number | null, y: number | null, connections = "[]",): WorldLocationLite => ({
  id,
  name: id,
  description: null,
  parent_location_id: null,
  connections,
  coord_x: x,
  coord_y: y,
});

const WORLD_ID = "w-store";

/** A live-getter view over a slice: prototype chain keeps `this` working. */
const asState = (slice: object, over: object,): WorldPageState =>
  Object.assign(Object.create(slice,), over,) as WorldPageState;

/** The composed page store: mixin slices merged, core fields owned here. */
describe("buildWorldPageState", () => {
  test("composes the mixin slices into a full page state", () => {
    const state = buildWorldPageState(WORLD_ID,);
    expect(state.worldId,).toBe(WORLD_ID,);
    // core
    expect(state.locations,).toEqual([],);
    expect(state.sseConnected,).toBe(false,);
    // mixin slices present
    expect(typeof state.loadTravelStatus,).toBe("function",);
    expect(typeof state.loadLore,).toBe("function",);
    expect(typeof state.selectLocation,).toBe("function",);
    expect(typeof state.moveChatTo,).toBe("function",);
    expect(state.timeOfDay,).toBeNull();
    // init returns a teardown closure
    expect(typeof state.init(),).toBe("function",);
  });

  test("connectionIdsOf parses the stored connections JSON", () => {
    const state = buildWorldPageState(WORLD_ID,);
    expect(state.connectionIdsOf(loc("a", 0, 0, '["b","c"]',),),).toEqual(["b", "c",],);
    expect(state.connectionIdsOf(loc("a", 0, 0, "junk",),),).toEqual([],);
  });
});

describe("timeWeatherWidget getters", () => {
  const ctx = asState(timeWeatherWidget, { timeOfDay: "midnight", weather: "storm", },);
  const empty = asState(timeWeatherWidget, {},);

  test("hasConditions tracks any recorded condition", () => {
    expect(ctx.hasConditions,).toBe(true,);
    expect(empty.hasConditions,).toBe(false,);
  });

  test("dayNightLabel classifies night times", () => {
    expect(ctx.dayNightLabel,).toBe("Night",);
    expect(empty.dayNightLabel,).toBe("—",);
  });

  test("icons resolve through the icon maps", () => {
    expect(ctx.timeIcon,).not.toBe("",);
    expect(ctx.weatherIcon,).not.toBe("",);
  });
});

describe("travelInterface getters", () => {
  const graph = [loc("hub", 0, 0, '["near"]',), loc("near", 3, 4,), loc("far", 50, 50,),];
  const ctx = asState(travelInterface, {
    locations: graph,
    originId: "hub",
    destinationId: "near",
    travelMethodId: "walk",
    locationById: (id: string,) => graph.find((l,) => l.id === id),
    connectionIdsOf: (l: WorldLocationLite,) => parseJsonList(l.connections,),
    travelStatus: {
      transports: [{
        locationId: "t",
        name: "Ferry",
        routeId: "r1",
        routeName: "Loop",
        loop: true,
        progress: 2,
        stopCount: 4,
        nextStopName: "Dock",
        hazards: ["storm",],
      },],
      parties: [],
    },
  },);

  test("destinations rank connected locations first", () => {
    expect(ctx.destinations[0]!.id,).toBe("near",);
    expect(ctx.destinations.map((l,) => l.id),).toContain("far",);
  });

  test("travelConnected reflects the origin graph", () => {
    expect(ctx.travelConnected,).toBe(true,);
  });

  test("travelEtaLabel uses coordinates over the hop fallback", () => {
    // 5 units at 5 units/h = 60m.
    expect(ctx.travelEtaLabel,).toBe("1h",);
  });

  test("transportProgresses projects percent and hazards", () => {
    expect(ctx.transportProgresses,).toHaveLength(1,);
    expect(ctx.transportProgresses[0]!.pct,).toBe(50,);
    expect(ctx.transportProgresses[0]!.hazards,).toEqual(["storm",],);
  });
});

describe("locationDetails and locationActions slices", () => {
  test("locationDetails starts with an empty detail slice", () => {
    expect(locationDetails.detail,).toBeNull();
    expect(locationDetails.selectedLocationId,).toBe("",);
  });

  test("parseJsonList handles stored JSON lists", () => {
    expect(parseJsonList('["sword","map"]',),).toEqual(["sword", "map",],);
    expect(parseJsonList(null,),).toEqual([],);
    expect(parseJsonList("42",),).toEqual([],);
  });

  test("chatsAt filters the chat list by location", () => {
    const ctx = asState(locationActions, {
      worldChats: [
        { id: "c1", name: "Here", current_location_id: "loc1", location_name: null, },
        { id: "c2", name: "There", current_location_id: "loc2", location_name: null, },
      ],
    },);

    expect(ctx.chatsAt("loc1",).map((c,) => c.id),).toEqual(["c1",],);
  });
});

// ── coreState (world.ts) ────────────────────────────────────────────────
// buildWorldPageState wires the slices in as live getters; the blocks below
// exercise the loaders, the SSE bridge and the graph helpers they rely on.

const wg = globalThis as unknown as { apiFetch?: (url: string | URL,) => Promise<Response> };
// These globals are owned by every other suite in this worker too, so the prior
// values are captured in `beforeEach` — immediately before we overwrite — and
// handed back verbatim in `afterEach`. Capturing at module scope instead would
// let this file delete a stub another file installed at import time.
let originalApiFetch: typeof wg.apiFetch;
let originalEventSource: typeof globalThis.EventSource;
let fetchLog: string[] = [];
let apiFetchStub: ((url: string,) => Response | Promise<Response>) | null = null;
let fetchWaiters: { count: number; resolve: () => void }[] = [];

class FakeEventSource {
  static CLOSED = 2;
  static last: FakeEventSource | null = null;
  readyState = 1;
  closed = false;
  listeners: Record<string, ((ev: unknown,) => void)[]> = {};

  constructor(public url: string,) {
    FakeEventSource.last = this;
  }

  addEventListener(type: string, fn: (ev: unknown,) => void,) {
    (this.listeners[type] ??= []).push(fn,);
  }

  close() {
    this.closed = true;
  }

  fire(type: string, ev: unknown = {},) {
    for (const fn of this.listeners[type] ?? []) { fn(ev,); }
  }
}

/** Wait until `count` requests have actually been issued — resolves off the
 * request signal itself, never a wall-clock sleep. */
function untilFetched(count: number,): Promise<void> {
  if (fetchLog.length >= count) { return Promise.resolve(); }
  const { promise, resolve, } = Promise.withResolvers<void>();
  fetchWaiters.push({ count, resolve, },);
  return promise;
}

/** Drain the microtask queue until `predicate` holds. Microtasks only — no
 * timers, so it is instant and cannot flake under load. Throws rather than
 * hanging if the state never arrives. */
async function untilSettled(predicate: () => boolean,): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (predicate()) { return; }
    await Promise.resolve();
  }

  throw new Error("condition never became true",);
}

beforeEach(() => {
  originalApiFetch = wg.apiFetch;
  originalEventSource = globalThis.EventSource;

  fetchLog = [];
  apiFetchStub = null;
  fetchWaiters = [];
  wg.apiFetch = async (url: string | URL,) => {
    fetchLog.push(String(url,),);
    fetchWaiters = fetchWaiters.filter((w,) => {
      if (fetchLog.length >= w.count) {
        w.resolve();
        return false;
      }

      return true;
    },);

    if (!apiFetchStub) { return new Response("{}", { status: 500, },); }
    return apiFetchStub(String(url,),);
  };
},);

afterEach(() => {
  apiFetchStub = null;
  wg.apiFetch = originalApiFetch;
  FakeEventSource.last = null;
  // Restore, don't delete: a sibling suite may have installed its own
  // EventSource before this file took the slot.
  if (originalEventSource === undefined) {
    delete (globalThis as { EventSource?: unknown }).EventSource;
  } else {
    globalThis.EventSource = originalEventSource;
  }
},);

describe("coreState.loadWorld", () => {
  test("maps the summary and clears the loading flag", async () => {
    apiFetchStub = () => Response.json({ name: "Westeros", description: "far away", kind: "rpg", },);
    const s = buildWorldPageState(WORLD_ID,);

    await s.loadWorld();

    expect(s.world,).toEqual({ id: WORLD_ID, name: "Westeros", description: "far away", kind: "rpg", },);
    expect(s.worldError,).toBe(false,);
    expect(s.worldLoading,).toBe(false,);
  });

  test("defaults a missing kind to rpg and a missing name to empty", async () => {
    apiFetchStub = () => Response.json({ description: null, },);
    const s = buildWorldPageState(WORLD_ID,);

    await s.loadWorld();

    expect(s.world,).toEqual({ id: WORLD_ID, name: "", description: null, kind: "rpg", },);
  });

  test("flags an error when the world cannot be read", async () => {
    apiFetchStub = () => new Response("nope", { status: 404, },);
    const s = buildWorldPageState(WORLD_ID,);

    await s.loadWorld();

    expect(s.worldError,).toBe(true,);
    expect(s.world,).toBeNull();
    expect(s.worldLoading,).toBe(false,);
  });

  test("flags an error when the request throws", async () => {
    apiFetchStub = () => {
      throw new Error("offline",);
    };

    const s = buildWorldPageState(WORLD_ID,);

    await s.loadWorld();

    expect(s.worldError,).toBe(true,);
    expect(s.worldLoading,).toBe(false,);
  });

  test("makes no request without a world id", async () => {
    apiFetchStub = () => Response.json({ name: "x", },);
    const s = buildWorldPageState("",);

    await s.loadWorld();

    expect(fetchLog,).toEqual([],);
  });
});

describe("coreState.loadLocations", () => {
  test("maps rows and coerces a bad connections value to an empty list", async () => {
    apiFetchStub = () =>
      Response.json({
        data: [{ id: "l1", name: "Town", connections: ["l2",], coord_x: 1, }, { name: "Nameless", },],
      },);

    const s = buildWorldPageState(WORLD_ID,);

    await s.loadLocations();

    expect(s.locations,).toHaveLength(2,);
    expect(s.locations[0]!.connections,).toBe("[]",);
    expect(s.locations[0]!.description,).toBeNull();
    expect(s.locations[1]!.id,).toBe("",);
    expect(s.locations[1]!.name,).toBe("Nameless",);
    expect(s.locationsLoading,).toBe(false,);
  });

  test("defaults the origin to the first location once the graph arrives", async () => {
    apiFetchStub = () => Response.json({ data: [{ id: "l1", }, { id: "l2", },], },);
    const s = buildWorldPageState(WORLD_ID,);

    await s.loadLocations();

    expect(s.originId,).toBe("l1",);
  });

  test("does not overwrite an origin the user already chose", async () => {
    apiFetchStub = () => Response.json({ data: [{ id: "l1", }, { id: "l2", },], },);
    const s = buildWorldPageState(WORLD_ID,);
    s.originId = "l2";

    await s.loadLocations();

    expect(s.originId,).toBe("l2",);
  });

  test("an empty world leaves the origin unset rather than blank", async () => {
    apiFetchStub = () => Response.json({ data: [], },);
    const s = buildWorldPageState(WORLD_ID,);

    await s.loadLocations();

    expect(s.locations,).toEqual([],);
    expect(s.originId,).toBe("",);
  });

  test("a failed load leaves the previous locations alone", async () => {
    apiFetchStub = () => new Response("nope", { status: 500, },);
    const s = buildWorldPageState(WORLD_ID,);
    s.locations = [loc("keep", 0, 0,),];

    await s.loadLocations();

    expect(s.locations.map((l,) => l.id),).toEqual(["keep",],);
    expect(s.locationsLoading,).toBe(false,);
  });
});

describe("coreState graph helpers", () => {
  test("locationById finds a known location and rejects an unknown one", () => {
    const s = buildWorldPageState(WORLD_ID,);
    s.locations = [loc("a", 0, 0,),];

    expect(s.locationById("a",)?.id,).toBe("a",);
    expect(s.locationById("ghost",),).toBeUndefined();
  });

  test("optionItems is a live view of the location list", () => {
    const s = buildWorldPageState(WORLD_ID,);
    expect(s.optionItems,).toEqual([],);

    s.locations = [loc("a", 0, 0,),];
    expect(s.optionItems.map((l,) => l.id),).toEqual(["a",],);
  });

  test("the mixin getters stay live rather than frozen at composition", () => {
    const s = buildWorldPageState(WORLD_ID,);
    s.locations = [loc("a", 0, 0, '["b"]',), loc("b", 1, 1,),];
    s.originId = "a";

    // Spread-composition would have frozen this at [] when the state was built.
    expect(s.destinations.map((l,) => l.id),).toEqual(["b",],);
  });
});

describe("coreState.applyConditions", () => {
  test("copies every snapshot field onto the page state", () => {
    const s = buildWorldPageState(WORLD_ID,);

    s.applyConditions({
      timeOfDay: "dusk",
      weather: "rain",
      sampledLocationId: "l1",
      sampledLocationName: "Town",
      sampledAt: "2026-01-01T00:00:00Z",
    },);

    expect(s.timeOfDay,).toBe("dusk",);
    expect(s.weather,).toBe("rain",);
    expect(s.conditionsLocationName,).toBe("Town",);
    expect(s.conditionsAt,).toBe("2026-01-01T00:00:00Z",);
  });
});

describe("coreState.connectConditionsStream", () => {
  test("does nothing when EventSource is unavailable", () => {
    delete (globalThis as { EventSource?: unknown }).EventSource;
    const s = buildWorldPageState(WORLD_ID,);

    s.connectConditionsStream();

    expect(s._conditionsSse,).toBeNull();
  });

  test("marks the page connected on open, against this world's stream", () => {
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
    const s = buildWorldPageState(WORLD_ID,);

    s.connectConditionsStream();

    expect(FakeEventSource.last?.url,).toBe(`/api/v1/worlds/${WORLD_ID}/stream`,);
    expect(s.sseConnected,).toBe(false,);

    FakeEventSource.last?.fire("open",);
    expect(s.sseConnected,).toBe(true,);
  });

  test("applies a conditions event and refreshes the travel feed", async () => {
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
    apiFetchStub = () => Response.json({ data: { transports: [], parties: [], }, },);
    const s = buildWorldPageState(WORLD_ID,);

    s.connectConditionsStream();
    FakeEventSource.last?.fire("conditions", {
      data: JSON.stringify({
        timeOfDay: "night",
        weather: "storm",
        sampledLocationId: "l1",
        sampledLocationName: "Keep",
        sampledAt: "2026-01-01T00:00:00Z",
      },),
    },);

    await untilSettled(() => s.travelStatus !== null);

    expect(s.timeOfDay,).toBe("night",);
    expect(s.weather,).toBe("storm",);
    expect(s.conditionsLocationName,).toBe("Keep",);
    expect(s.travelStatus,).toEqual({ transports: [], parties: [], },);
  });

  test("a malformed conditions payload falls back to empty, not a crash", () => {
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
    const s = buildWorldPageState(WORLD_ID,);
    s.timeOfDay = "noon";

    s.connectConditionsStream();
    FakeEventSource.last?.fire("conditions", { data: "{not json", },);

    expect(s.timeOfDay,).toBeNull();
  });

  test("a retrying stream is still reported as connected; a closed one is not", () => {
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
    const s = buildWorldPageState(WORLD_ID,);

    s.connectConditionsStream();
    const source = FakeEventSource.last!;

    source.readyState = 1; // CONNECTING — EventSource is still retrying.
    source.fire("error",);
    expect(s.sseConnected,).toBe(true,);

    source.readyState = FakeEventSource.CLOSED;
    source.fire("error",);
    expect(s.sseConnected,).toBe(false,);
  });

  test("reconnecting closes the previous stream", () => {
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
    const s = buildWorldPageState(WORLD_ID,);

    s.connectConditionsStream();
    const first = FakeEventSource.last!;
    s.connectConditionsStream();

    expect(first.closed,).toBe(true,);
    expect(FakeEventSource.last,).not.toBe(first,);
  });
});

describe("coreState.init", () => {
  test("kicks off every loader and returns a teardown that closes the stream", async () => {
    (globalThis as { EventSource?: unknown }).EventSource = FakeEventSource;
    apiFetchStub = () => Response.json({ data: [], },);
    const s = buildWorldPageState(WORLD_ID,);

    const teardown = s.init();
    // Await the requests themselves — no wall-clock sleep.
    await untilFetched(5,);

    const urls = fetchLog.map((u,) => u.split("?",)[0]!);
    expect(urls,).toContain(`/api/v1/worlds/${WORLD_ID}/chats`,);
    expect(urls,).toContain(`/api/v1/worlds/${WORLD_ID}/travel/status`,);
    expect(urls,).toContain(`/api/v1/worlds/${WORLD_ID}/edges`,);
    expect(urls.some((u,) => u.endsWith("/locations",)),).toBe(true,);

    expect(s._conditionsSse,).not.toBeNull();
    teardown();
    expect(s._conditionsSse,).toBeNull();
    expect(FakeEventSource.last?.closed,).toBe(true,);
  });
});
