// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { locationActions, } from "./location-actions";
import { locationDetails, parseJsonList, } from "./location-details";
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
