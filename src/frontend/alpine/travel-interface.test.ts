// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { parseJsonList, } from "../../utils";
import { travelInterface, } from "./travel-interface";
import type { PartyStatus, WorldEdgeLink, WorldLocationLite, WorldPageState, } from "./world-types";

// Bare-global apiFetch/showToast pattern (mirrors world-locations.test.ts).
const g = globalThis as unknown as {
  apiFetch?: (url: string | URL, opts?: RequestInit,) => Promise<Response>;
  showToast?: (kind: string, message: string,) => void;
};

// These globals are owned by every other suite in this worker too, so the prior
// values are captured in `beforeEach` — immediately before we overwrite — and
// handed back verbatim in `afterEach`. Capturing at module scope instead would
// let this file delete a stub another file installed at import time.
let originalApiFetch: typeof g.apiFetch;
let originalShowToast: typeof g.showToast;

let fetchCalls: string[] = [];
let toasts: { kind: string; message: string }[] = [];
let fetchHandler: ((url: string,) => Response | Promise<Response>) | null = null;

const WORLD_ID = "w1";

/** A complete PartyStatus row — the loader stores the wire payload verbatim, so
 * a partial object would test nothing about the mapping. */
const party = (id: string,): PartyStatus => ({
  id,
  name: `party-${id}`,
  status: "walking",
  routeIndex: 0,
  travelProgress: 0.5,
  currentLocationId: null,
  currentLocationName: null,
  hazards: [],
});

const loc = (id: string, x: number | null, y: number | null, connections = "[]",): WorldLocationLite => ({
  id,
  name: id,
  description: null,
  parent_location_id: null,
  connections,
  coord_x: x,
  coord_y: y,
});

const edge = (from: string, to: string, over: Partial<WorldEdgeLink> = {},): WorldEdgeLink => ({
  id: `${from}->${to}`,
  from_id: from,
  to_id: to,
  mode: "road",
  game_hours: 2,
  requires_discovery: false,
  ...over,
});

/** A live-getter view over a slice: prototype chain keeps `this` working.
 * Only DATA fields and CROSS-SLICE collaborators belong here — stubbing a
 * method of THIS slice would shadow the real one and make a test pass
 * without ever exercising it. */
const asState = (slice: object, over: object,): WorldPageState =>
  Object.assign(Object.create(slice,), over,) as WorldPageState;

function ctx(locations: WorldLocationLite[], overrides?: object,): WorldPageState {
  return asState(travelInterface, {
    worldId: WORLD_ID,
    locations,
    originId: "",
    destinationId: "",
    travelMethodId: "walk",
    travelStatus: null,
    travelLoading: false,
    showTravelConfirm: false,
    travelChatId: "",
    travelBusy: false,
    travelMessage: "",
    edgeLinks: [],
    edgesLoaded: false,
    edgesLoading: false,
    // Core-slice collaborators (world.ts owns these).
    locationById: (id: string,) => locations.find((l,) => l.id === id),
    connectionIdsOf: (l: WorldLocationLite,) => parseJsonList(l.connections,),
    // location-actions slice owns the actual move.
    moveChatTo: async () => {},
    ...overrides,
  },);
}

beforeEach(() => {
  originalApiFetch = g.apiFetch;
  originalShowToast = g.showToast;

  fetchCalls = [];
  toasts = [];
  fetchHandler = null;
  g.apiFetch = async (url: string | URL,) => {
    fetchCalls.push(String(url,),);
    if (!fetchHandler) { return new Response("{}", { status: 500, },); }
    return fetchHandler(String(url,),);
  };

  g.showToast = (kind: string, message: string,) => {
    toasts.push({ kind, message, },);
  };
},);

afterEach(() => {
  fetchHandler = null;
  g.apiFetch = originalApiFetch;
  g.showToast = originalShowToast;
},);

describe("travelInterface.loadTravelStatus", () => {
  test("stores the status payload and clears the loading flag", async () => {
    fetchHandler = () => Response.json({ data: { transports: [], parties: [party("pt1",),], }, },);
    const c = ctx([],);

    await c.loadTravelStatus();

    expect(c.partyStatuses,).toEqual([party("pt1",),],);
    expect(c.travelLoading,).toBe(false,);
    expect(fetchCalls,).toEqual([`/api/v1/worlds/${WORLD_ID}/travel/status`,],);
  });

  test("keeps the previous status when the feed fails", async () => {
    fetchHandler = () => new Response("nope", { status: 500, },);
    const c = ctx([], { travelStatus: { transports: [], parties: [party("keep",),], }, },);

    await c.loadTravelStatus();

    expect(c.partyStatuses,).toEqual([party("keep",),],);
    expect(c.travelLoading,).toBe(false,);
  });

  test("an empty data payload leaves the previous status untouched", async () => {
    fetchHandler = () => Response.json({},);
    const c = ctx([], { travelStatus: { transports: [], parties: [party("keep",),], }, },);

    await c.loadTravelStatus();

    expect(c.partyStatuses,).toEqual([party("keep",),],);
  });
});

describe("travelInterface.loadGraphEdges", () => {
  test("loads and stores the edge list once", async () => {
    fetchHandler = () => Response.json({ data: [edge("a", "b",), edge("b", "c",),], },);
    const c = ctx([],);

    await c.loadGraphEdges();

    expect(c.edgeLinks.map((e,) => e.id),).toEqual(["a->b", "b->c",],);
    expect(c.edgesLoaded,).toBe(true,);
    expect(c.edgesLoading,).toBe(false,);
    expect(fetchCalls,).toEqual([`/api/v1/worlds/${WORLD_ID}/edges`,],);

    // Second call must be a no-op — the graph loads once per page.
    await c.loadGraphEdges();
    expect(fetchCalls.length,).toBe(1,);
  });

  test("drops malformed edges rather than trusting the wire", async () => {
    fetchHandler = () =>
      Response.json({
        data: [
          edge("a", "b",),
          { from_id: 1, to_id: "c", mode: "road", },
          { from_id: "d", to_id: null, mode: "road", },
          { from_id: "e", to_id: "f", mode: null, },
          null,
        ],
      },);

    const c = ctx([],);

    await c.loadGraphEdges();

    expect(c.edgeLinks.map((e,) => e.id),).toEqual(["a->b",],);
    expect(c.edgesLoaded,).toBe(true,);
  });

  test("a failed load yields an empty graph, not a crash", async () => {
    fetchHandler = () => new Response("boom", { status: 500, },);
    const c = ctx([],);

    await c.loadGraphEdges();

    expect(c.edgeLinks,).toEqual([],);
    expect(c.edgesLoaded,).toBe(true,);
    expect(c.edgesLoading,).toBe(false,);
  });

  test("does not re-enter while a load is already in flight", async () => {
    fetchHandler = () => Response.json({ data: [], },);
    const c = ctx([], { edgesLoading: true, },);

    await c.loadGraphEdges();

    expect(fetchCalls,).toEqual([],);
  });
});

describe("travelInterface.edgeToDestination", () => {
  const graph = [loc("a", 0, 0,), loc("b", 0, 0,),];

  test("matches an edge in either direction", () => {
    const fwd = ctx(graph, { originId: "a", destinationId: "b", edgeLinks: [edge("a", "b",),], },);
    expect(fwd.edgeToDestination?.id,).toBe("a->b",);

    const rev = ctx(graph, { originId: "b", destinationId: "a", edgeLinks: [edge("a", "b",),], },);
    expect(rev.edgeToDestination?.id,).toBe("a->b",);
  });

  test("is undefined without both endpoints chosen", () => {
    const noDest = ctx(graph, { originId: "a", destinationId: "", edgeLinks: [edge("a", "b",),], },);
    expect(noDest.edgeToDestination,).toBeUndefined();

    const noOrigin = ctx(graph, { originId: "", destinationId: "b", edgeLinks: [edge("a", "b",),], },);
    expect(noOrigin.edgeToDestination,).toBeUndefined();
  });

  test("an unset origin never resolves, even against a blank-id edge", () => {
    // The edge filter only checks types, so a row with an empty from_id can
    // reach the client. With no origin selected it must not match anything.
    const graph = [loc("a", 0, 0,), loc("b", 0, 0,),];
    const c = ctx(graph, { originId: "", destinationId: "b", edgeLinks: [edge("", "b",),], },);
    expect(c.edgeToDestination,).toBeUndefined();
  });

  test("does not match an edge between two other locations", () => {
    const c = ctx(graph, { originId: "a", destinationId: "b", edgeLinks: [edge("x", "y",),], },);
    expect(c.edgeToDestination,).toBeUndefined();
  });
});

describe("travelInterface.destinations", () => {
  test("excludes the origin itself", () => {
    const c = ctx([loc("a", 0, 0,), loc("b", 1, 1,),], { originId: "a", },);
    expect(c.destinations.map((l,) => l.id),).toEqual(["b",],);
  });

  test("ranks edge-connected first, then graph-connected, then the rest", () => {
    const graph = [
      loc("hub", 0, 0, '["near"]',),
      loc("near", 1, 1,),
      loc("edgey", 2, 2,),
      loc("far", 9, 9,),
    ];

    const c = ctx(graph, { originId: "hub", edgeLinks: [edge("hub", "edgey",),], },);

    expect(c.destinations.map((l,) => l.id),).toEqual(["edgey", "near", "far",],);
  });

  test("an edge from the destination back to the origin still counts", () => {
    const graph = [loc("hub", 0, 0,), loc("edgey", 2, 2,), loc("far", 9, 9,),];
    const c = ctx(graph, { originId: "hub", edgeLinks: [edge("edgey", "hub",),], },);

    expect(c.destinations[0]!.id,).toBe("edgey",);
  });

  test("an inbound edge outranks a merely graph-connected location", () => {
    // edgey is reached by an edge pointing AT the origin; mid only through
    // the legacy connection graph. The edge must win the ranking.
    const graph = [
      loc("hub", 0, 0, '["mid"]',),
      loc("edgey", 2, 2,),
      loc("mid", 3, 3,),
      loc("far", 9, 9,),
    ];

    const c = ctx(graph, { originId: "hub", edgeLinks: [edge("edgey", "hub",),], },);

    expect(c.destinations.map((l,) => l.id),).toEqual(["edgey", "mid", "far",],);
  });

  test("with no origin known it lists everything", () => {
    const c = ctx([loc("a", 0, 0,), loc("b", 1, 1,),], { originId: "", },);
    expect(c.destinations.map((l,) => l.id),).toEqual(["a", "b",],);
  });
});

describe("travelInterface.travelConnected", () => {
  test("true via a direct edge", () => {
    const graph = [loc("a", 0, 0,), loc("b", 1, 1,),];
    const c = ctx(graph, { originId: "a", destinationId: "b", edgeLinks: [edge("a", "b",),], },);
    expect(c.travelConnected,).toBe(true,);
  });

  test("true via a legacy connection-graph link", () => {
    const graph = [loc("a", 0, 0, '["b"]',), loc("b", 1, 1,),];
    const c = ctx(graph, { originId: "a", destinationId: "b", edgeLinks: [], },);
    expect(c.travelConnected,).toBe(true,);
  });

  test("false for two unconnected locations", () => {
    const graph = [loc("a", 0, 0,), loc("b", 1, 1,),];
    const c = ctx(graph, { originId: "a", destinationId: "b", edgeLinks: [], },);
    expect(c.travelConnected,).toBe(false,);
  });

  test("false when either endpoint is unknown — never guesses", () => {
    const graph = [loc("a", 0, 0,),];
    const badDest = ctx(graph, { originId: "a", destinationId: "ghost", edgeLinks: [edge("a", "ghost",),], },);
    expect(badDest.travelConnected,).toBe(false,);

    const badOrigin = ctx(graph, { originId: "ghost", destinationId: "a", edgeLinks: [], },);
    expect(badOrigin.travelConnected,).toBe(false,);
  });
});

describe("travelInterface.travelEtaLabel", () => {
  test("an explicit edge supplies the trip length", () => {
    const graph = [loc("a", 0, 0,), loc("b", 900, 900,),];
    const c = ctx(graph, {
      originId: "a",
      destinationId: "b",
      edgeLinks: [edge("a", "b", { mode: "river", game_hours: 3, },),],
    },);

    // 3 game hours -> 180 minutes, and it is labelled an estimate.
    expect(c.travelEtaLabel,).toBe("3h (river, est.)",);
  });

  test("falls back to coordinates when no edge exists", () => {
    // 10 units at 5 units/h (walk) = 120m.
    const c = ctx([loc("a", 0, 0,), loc("b", 6, 8,),], { originId: "a", destinationId: "b", },);
    expect(c.travelEtaLabel,).toBe("2h",);
  });

  test("teleport is instant regardless of distance", () => {
    const c = ctx([loc("a", 0, 0,), loc("b", 999, 999,),], {
      originId: "a",
      destinationId: "b",
      travelMethodId: "teleport",
    },);

    expect(c.travelEtaLabel,).toBe("instant",);
  });

  test("an unknown method id degrades to walk, not to a crash", () => {
    const graph = [loc("a", 0, 0,), loc("b", 5, 0,),];
    const walk = ctx(graph, { originId: "a", destinationId: "b", travelMethodId: "walk", },);
    const bogus = ctx(graph, { originId: "a", destinationId: "b", travelMethodId: "banana", },);
    expect(bogus.travelEtaLabel,).toBe(walk.travelEtaLabel,);
  });

  test("missing coordinates without a hop count is unknown, not a guess", () => {
    const c = ctx([loc("a", null, null,), loc("b", null, null,),], {
      originId: "a",
      destinationId: "b",
    },);

    expect(c.travelEtaLabel,).toBe("unknown",);
  });

  test("is a dash when an endpoint is not a known location", () => {
    const c = ctx([loc("a", 0, 0,),], { originId: "a", destinationId: "ghost", },);
    expect(c.travelEtaLabel,).toBe("—",);
  });
});

describe("travelInterface.edgeInfoLabel", () => {
  test("summarises the direct edge", () => {
    const graph = [loc("a", 0, 0,), loc("b", 1, 1,),];
    const c = ctx(graph, {
      originId: "a",
      destinationId: "b",
      edgeLinks: [edge("a", "b", { mode: "road", game_hours: 4, },),],
    },);

    expect(c.edgeInfoLabel,).toBe("Edge: road, 4 game h",);
  });

  test("flags an undiscovered edge", () => {
    const graph = [loc("a", 0, 0,), loc("b", 1, 1,),];
    const c = ctx(graph, {
      originId: "a",
      destinationId: "b",
      edgeLinks: [edge("a", "b", { mode: "road", game_hours: 1, requires_discovery: true, },),],
    },);

    expect(c.edgeInfoLabel,).toBe("Edge: road, 1 game h (locked until discovered)",);
  });

  test("is empty when no edge connects the pair", () => {
    const c = ctx([loc("a", 0, 0,), loc("b", 1, 1,),], { originId: "a", destinationId: "b", edgeLinks: [], },);
    expect(c.edgeInfoLabel,).toBe("",);
  });
});

describe("travelInterface.transportProgresses", () => {
  test("projects percent, route and hazards", () => {
    const c = ctx([], {
      travelStatus: {
        transports: [{
          locationId: "t",
          name: "Ferry",
          routeId: "r",
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

    expect(c.transportProgresses,).toEqual([{
      name: "Ferry",
      pct: 50,
      routeName: "Loop",
      nextStopName: "Dock",
      hazards: ["storm",],
    },],);
  });

  test("caps percent at 100 when progress overshoots", () => {
    const c = ctx([], {
      travelStatus: {
        transports: [{
          locationId: "t",
          name: "Ferry",
          routeId: "r",
          routeName: "Loop",
          loop: false,
          progress: 50,
          stopCount: 4,
          nextStopName: null,
          hazards: [],
        },],
        parties: [],
      },
    },);

    expect(c.transportProgresses[0]!.pct,).toBe(100,);
  });

  test("a transport with no stops is 0%, never NaN", () => {
    const c = ctx([], {
      travelStatus: {
        transports: [{
          locationId: "t",
          name: "Ferry",
          routeId: "r",
          routeName: "Loop",
          loop: false,
          progress: 0,
          stopCount: 0,
          nextStopName: null,
          hazards: [],
        },],
        parties: [],
      },
    },);

    expect(c.transportProgresses[0]!.pct,).toBe(0,);
  });

  test("no status yields no progresses", () => {
    const c = ctx([],);
    expect(c.transportProgresses,).toEqual([],);
    expect(c.partyStatuses,).toEqual([],);
  });
});

describe("travelInterface travel confirmation", () => {
  test("refuses to open without a destination and says why", () => {
    const c = ctx([], { destinationId: "", },);
    c.openTravelConfirm();

    expect(c.showTravelConfirm,).toBe(false,);
    expect(toasts,).toEqual([{ kind: "error", message: "Choose a destination first", },],);
  });

  test("opens the dialog and clears any previous message", () => {
    const c = ctx([], { destinationId: "b", travelMessage: "stale", },);
    c.openTravelConfirm();

    expect(c.showTravelConfirm,).toBe(true,);
    expect(c.travelMessage,).toBe("",);
  });

  test("refuses to travel without a chat and leaves the dialog open", async () => {
    const c = ctx([], { destinationId: "b", travelChatId: "", showTravelConfirm: true, },);
    await c.confirmTravel();

    expect(c.travelMessage,).toBe("Select one of your chats to travel with.",);
    expect(c.showTravelConfirm,).toBe(true,);
  });

  test("moves the chosen chat to the destination and closes on success", async () => {
    const moves: { chatId: string; locationId: string }[] = [];
    const c = ctx([], {
      destinationId: "b",
      travelChatId: "c1",
      showTravelConfirm: true,
      moveChatTo: async (chatId: string, locationId: string,) => {
        moves.push({ chatId, locationId, },);
      },
    },);

    await c.confirmTravel();

    expect(moves,).toEqual([{ chatId: "c1", locationId: "b", },],);
    expect(c.showTravelConfirm,).toBe(false,);
  });

  test("keeps the dialog open when the move fails", async () => {
    const c = ctx([], {
      destinationId: "b",
      travelChatId: "c1",
      showTravelConfirm: true,
      travelBusy: true,
      moveChatTo: async () => {
        // A failed move leaves travelBusy set (the move owns that flag).
      },
    },);

    await c.confirmTravel();

    expect(c.showTravelConfirm,).toBe(true,);
  });
});
