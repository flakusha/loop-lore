import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { ExplorerLocation, ExplorerLocationState, } from "./location-explorer";
import { locationExplorerControls, } from "./location-explorer-controls";

interface ControlState {
  worldId: string;
  locations: ExplorerLocation[];
  states: ExplorerLocationState[];
  search: string;
  filterStatus: string;
  filterHasState: "" | "yes" | "no";
  filterAtmosphere: string;
  filterWeather: string;
  filterTimeOfDay: string;
  filterTopLevelOnly: boolean;
  atmosphereOptions: string[];
  weatherOptions: string[];
  timeOfDayOptions: string[];
  _hoverTimer: number;
  _hoveredLocId: string | null;
  selectLoc(locId: string,): Promise<void>;
}

/**
 * @param overrides
 */
function makeCtx(overrides: Partial<ControlState> = {},): ControlState {
  return {
    worldId: "world-1",
    locations: [],
    states: [],
    search: "",
    filterStatus: "",
    filterHasState: "",
    filterAtmosphere: "",
    filterWeather: "",
    filterTimeOfDay: "",
    filterTopLevelOnly: false,
    atmosphereOptions: [],
    weatherOptions: [],
    timeOfDayOptions: [],
    _hoverTimer: 0,
    _hoveredLocId: null,
    selectLoc: mock(async () => {},),
    ...overrides,
  };
}

/**
 * @param id
 * @param publication_status
 */
function makeLoc(id: string, publication_status: string,): ExplorerLocation {
  return { id, name: id, description: null, parent_location_id: null, connections: "", publication_status, };
}

/**
 * @param location_id
 * @param atmosphere
 * @param weather
 * @param time_of_day
 */
function makeStateRow(
  location_id: string,
  atmosphere: string | null,
  weather: string | null,
  time_of_day: string | null,
): ExplorerLocationState {
  return {
    location_id,
    atmosphere,
    description_override: null,
    npcs_present: "",
    items_available: "",
    time_of_day,
    weather,
    hazards: "",
  };
}

describe("locationExplorerControls._refreshOptionLists", () => {
  test("collects distinct non-null values, sorted", () => {
    const ctx = makeCtx({
      states: [
        makeStateRow("l1", "tense", "rain", "night",),
        makeStateRow("l2", "tense", null, "dawn",),
        makeStateRow("l3", null, "fog", null,),
        makeStateRow("l4", "", "", "",),
      ],
    },);
    locationExplorerControls._refreshOptionLists.call(ctx,);
    expect(ctx.atmosphereOptions,).toEqual(["tense",],);
    expect(ctx.weatherOptions,).toEqual(["fog", "rain",],);
    expect(ctx.timeOfDayOptions,).toEqual(["dawn", "night",],);
  });

  test("leaves the option lists empty without states", () => {
    const ctx = makeCtx();
    locationExplorerControls._refreshOptionLists.call(ctx,);
    expect(ctx.atmosphereOptions,).toEqual([],);
    expect(ctx.weatherOptions,).toEqual([],);
    expect(ctx.timeOfDayOptions,).toEqual([],);
  });
});

describe("locationExplorerControls.statusOptions", () => {
  test("returns distinct publication_status values, sorted", () => {
    const ctx = makeCtx({
      locations: [
        makeLoc("l1", "draft",),
        makeLoc("l2", "published",),
        makeLoc("l3", "draft",),
        makeLoc("l4", "",),
      ],
    },);
    expect(locationExplorerControls.statusOptions.call(ctx,),).toEqual(["draft", "published",],);
  });

  test("returns an empty list without locations", () => {
    const ctx = makeCtx();
    expect(locationExplorerControls.statusOptions.call(ctx,),).toEqual([],);
  });
});

describe("locationExplorerControls.hasActiveFilters", () => {
  test("is false at defaults", () => {
    const ctx = makeCtx();
    expect(locationExplorerControls.hasActiveFilters.call(ctx,),).toBe(false,);
  });

  test("is true for each individual filter", () => {
    const ctx = makeCtx();
    // Surrounding whitespace still counts — the check trims before testing.
    ctx.search = "  tavern  ";
    expect(locationExplorerControls.hasActiveFilters.call(ctx,),).toBe(true,);
    ctx.search = "";
    ctx.filterStatus = "draft";
    expect(locationExplorerControls.hasActiveFilters.call(ctx,),).toBe(true,);
    ctx.filterStatus = "";
    ctx.filterHasState = "yes";
    expect(locationExplorerControls.hasActiveFilters.call(ctx,),).toBe(true,);
    ctx.filterHasState = "";
    ctx.filterAtmosphere = "tense";
    expect(locationExplorerControls.hasActiveFilters.call(ctx,),).toBe(true,);
    ctx.filterAtmosphere = "";
    ctx.filterWeather = "rain";
    expect(locationExplorerControls.hasActiveFilters.call(ctx,),).toBe(true,);
    ctx.filterWeather = "";
    ctx.filterTimeOfDay = "night";
    expect(locationExplorerControls.hasActiveFilters.call(ctx,),).toBe(true,);
    ctx.filterTimeOfDay = "";
    ctx.filterTopLevelOnly = true;
    expect(locationExplorerControls.hasActiveFilters.call(ctx,),).toBe(true,);
  });
});

describe("locationExplorerControls.clearFilters", () => {
  test("resets every filter field", () => {
    const ctx = makeCtx({
      search: "tavern",
      filterStatus: "draft",
      filterHasState: "yes",
      filterAtmosphere: "tense",
      filterWeather: "rain",
      filterTimeOfDay: "night",
      filterTopLevelOnly: true,
    },);
    locationExplorerControls.clearFilters.call(ctx,);
    expect(ctx.search,).toBe("",);
    expect(ctx.filterStatus,).toBe("",);
    expect(ctx.filterHasState,).toBe("",);
    expect(ctx.filterAtmosphere,).toBe("",);
    expect(ctx.filterWeather,).toBe("",);
    expect(ctx.filterTimeOfDay,).toBe("",);
    expect(ctx.filterTopLevelOnly,).toBe(false,);
  });
});

describe("locationExplorerControls hover/navigate with window", () => {
  const realWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      clearTimeout,
      setTimeout,
      location: { href: "", },
    };
  },);

  afterEach(() => {
    (globalThis as { window?: unknown }).window = realWindow;
  },);

  test("hoverLoc schedules selectLoc after the throttle delay", async () => {
    const selectLoc = mock(async (_locId: string,) => {},);
    const ctx = makeCtx({ selectLoc, },);
    locationExplorerControls.hoverLoc.call(ctx, "loc-1",);
    expect(ctx._hoveredLocId,).toBe("loc-1",);
    expect(ctx._hoverTimer,).not.toBe(0,);
    // Poll for the debounced run instead of a fixed sleep: under full-suite
    // load a 350ms timer can fire well past a fixed 350ms wait (flake).
    const deadline = Date.now() + 10_000;
    while (selectLoc.mock.calls.length === 0 && Date.now() < deadline) {
      await new Promise<void>((resolve,) => setTimeout(resolve, 25,));
    }
    expect(selectLoc,).toHaveBeenCalledTimes(1,);
    expect(selectLoc.mock.calls[0]?.[0],).toBe("loc-1",);
  });

  test("moving to another row cancels the pending preview", async () => {
    const selectLoc = mock(async (_locId: string,) => {},);
    const ctx = makeCtx({ selectLoc, },);
    locationExplorerControls.hoverLoc.call(ctx, "loc-1",);
    locationExplorerControls.hoverLoc.call(ctx, "loc-2",);
    const deadline = Date.now() + 10_000;
    while (selectLoc.mock.calls.length === 0 && Date.now() < deadline) {
      await new Promise<void>((resolve,) => setTimeout(resolve, 25,));
    }
    expect(selectLoc.mock.calls,).toEqual([["loc-2",],],);
    // Fixed wait past the 350ms throttle: proves the superseded timer never
    // fires. Deterministic time control is unavailable in this bun version
    // (no mock.timers), so a genuine delay is required for the negative
    // assertion.
    await new Promise<void>((resolve,) => setTimeout(resolve, 400,));
    expect(selectLoc.mock.calls,).toEqual([["loc-2",],],);
  });

  test("leaveLoc cancels the pending preview", async () => {
    const selectLoc = mock(async (_locId: string,) => {},);
    const ctx = makeCtx({ selectLoc, },);
    locationExplorerControls.hoverLoc.call(ctx, "loc-1",);
    locationExplorerControls.leaveLoc.call(ctx,);
    expect(ctx._hoveredLocId,).toBe("",);
    // Fixed wait past the 350ms throttle — see the note above on why the
    // negative assertion needs a genuine delay.
    await new Promise<void>((resolve,) => setTimeout(resolve, 400,));
    expect(selectLoc,).not.toHaveBeenCalled();
  });

  test("navigateTo sets window.location.href", () => {
    const ctx = makeCtx({ worldId: "world-9", },);
    const win = (globalThis as unknown as { window: { location: { href: string } } }).window;
    locationExplorerControls.navigateTo.call(ctx, "loc-42",);
    expect(win.location.href,).toBe("/worlds/world-9/locations/loc-42",);
  });
});

describe("locationExplorerControls window guards", () => {
  test("hoverLoc and navigateTo no-op without window", () => {
    const ctx = makeCtx();
    locationExplorerControls.hoverLoc.call(ctx, "loc-1",);
    expect(ctx._hoveredLocId,).toBe("loc-1",);
    locationExplorerControls.leaveLoc.call(ctx,);
    locationExplorerControls.navigateTo.call(ctx, "loc-1",);
    // No throw — the window guards held.
  });
});
