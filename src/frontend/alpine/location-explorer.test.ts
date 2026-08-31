import { afterEach, describe, expect, test, } from "bun:test";
import type { ExplorerDetail, ExplorerLocation, ExplorerLocationState, } from "./location-explorer";

// ── apiFetch is a global registered by ./htmx at module load; we override
// it here because the SUT references it via the global, not a static import.
let fetchCalls: { url: string; opts?: RequestInit }[] = [];
let fetchHandler: ((url: string, opts?: RequestInit,) => Response | Promise<Response>) | null = null;
(globalThis as unknown as { apiFetch: (url: string, opts?: RequestInit,) => Promise<Response> }).apiFetch = async (
  url: string,
  opts?: RequestInit,
) => {
  fetchCalls.push({ url, opts, },);
  if (!fetchHandler) { return new Response("{}", { status: 200, },); }
  return fetchHandler(url, opts,);
};

// Side-effect import: must run AFTER the globalThis.apiFetch override above
// so the SUT picks up our mock.
// eslint-disable-next-line import/first
import "./location-explorer";

interface ExplorerState {
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
  statusOptions(): string[];
  hasActiveFilters(): boolean;
  selectedLocId: string | null;
  detail: ExplorerDetail | null;
  _detailCache: Record<string, ExplorerDetail>;
  _hoverTimer: number;
  _hoveredLocId: string;
  load(): Promise<void>;
  selectLoc(locId: string,): Promise<void>;
  hoverLoc(locId: string,): void;
  leaveLoc(): void;
  navigateTo(locId: string,): void;
  toggleExpand(id: string,): void;
  isExpanded(id: string,): boolean;
  clearFilters(): void;
  roots: ExplorerLocation[];
  childrenOf(id: string,): ExplorerLocation[];
  hasChildren(id: string,): boolean;
  filteredLocations: ExplorerLocation[];
}

const fixture = {
  data: {
    locations: [
      {
        id: "loc-1",
        name: "Tavern",
        description: "Cozy spot",
        parent_location_id: null,
        connections: "[]",
        publication_status: "published",
      },
      {
        id: "loc-2",
        name: "Forest",
        description: null,
        parent_location_id: null,
        connections: "[]",
        publication_status: "draft",
      },
      {
        id: "loc-3",
        name: "Cave",
        description: "Dark",
        parent_location_id: "loc-1",
        connections: "[]",
        publication_status: "published",
      },
    ],
    states: [
      {
        location_id: "loc-1",
        atmosphere: "warm",
        description_override: null,
        npcs_present: "[]",
        items_available: "[]",
        time_of_day: "evening",
        weather: "clear",
        hazards: "[]",
      },
      {
        location_id: "loc-3",
        atmosphere: "damp",
        description_override: null,
        npcs_present: "[]",
        items_available: "[]",
        time_of_day: null,
        weather: "rain",
        hazards: "[]",
      },
      // loc-2 has no state — exercises the "no state" filter.
    ],
  },
};

/**
 * @param status
 * @param body
 */
function mockFetch(status: number, body: unknown = {},) {
  fetchHandler = () => Response.json(body, { status, },);
}

/** */
function makeState(): ExplorerState {
  const factory = (globalThis as { locationExplorerState?: (id: string,) => ExplorerState }).locationExplorerState;
  if (!factory) { throw new Error("locationExplorerState not registered on globalThis",); }
  return factory("world-1",);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

describe("locationExplorerState", () => {
  describe("filteredLocations", () => {
    test("returns all locations when no filters are active", async () => {
      const state = makeState();
      mockFetch(200, fixture,);
      await state.load();
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["loc-1", "loc-2", "loc-3",],);
    });

    test("search filters by name and description (case-insensitive)", async () => {
      const state = makeState();
      mockFetch(200, fixture,);
      await state.load();
      state.search = "cozy";
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["loc-1",],);
      state.search = "DARK";
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["loc-3",],);
    });

    test("filterStatus matches publication_status exactly", async () => {
      const state = makeState();
      mockFetch(200, fixture,);
      await state.load();
      state.filterStatus = "draft";
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["loc-2",],);
    });

    test("filterHasState separates locations with vs. without a state row", async () => {
      const state = makeState();
      mockFetch(200, fixture,);
      await state.load();
      state.filterHasState = "yes";
      expect(state.filteredLocations.map((l,) => l.id).sort(),).toEqual(["loc-1", "loc-3",],);
      state.filterHasState = "no";
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["loc-2",],);
    });

    test("filterAtmosphere ignores locations without a state row", async () => {
      const state = makeState();
      mockFetch(200, fixture,);
      await state.load();
      state.filterAtmosphere = "damp";
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["loc-3",],);
    });

    test("filterTopLevelOnly excludes nested locations", async () => {
      const state = makeState();
      mockFetch(200, fixture,);
      await state.load();
      state.filterTopLevelOnly = true;
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["loc-1", "loc-2",],);
    });

    test("filters compose (AND)", async () => {
      const state = makeState();
      mockFetch(200, fixture,);
      await state.load();
      state.filterStatus = "published";
      state.filterWeather = "rain";
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["loc-3",],);
    });

    test("clearFilters resets every filter field", async () => {
      const state = makeState();
      mockFetch(200, fixture,);
      await state.load();
      state.search = "tavern";
      state.filterStatus = "draft";
      state.filterHasState = "yes";
      state.filterTopLevelOnly = true;
      expect(state.hasActiveFilters(),).toBe(true,);
      state.clearFilters();
      expect(state.search,).toBe("",);
      expect(state.filterStatus,).toBe("",);
      expect(state.filterHasState as string,).toBe("",);
      expect(state.filterTopLevelOnly,).toBe(false,);
      expect(state.hasActiveFilters(),).toBe(false,);
      expect(state.filteredLocations.length,).toBe(3,);
    });
  });

  describe("option lists", () => {
    test("atmosphere/weather/timeOfDay options derive from loaded states, sorted", async () => {
      const state = makeState();
      mockFetch(200, fixture,);
      await state.load();
      expect(state.atmosphereOptions,).toEqual(["damp", "warm",],);
      expect(state.weatherOptions,).toEqual(["clear", "rain",],);
      expect(state.timeOfDayOptions,).toEqual(["evening",],);
    });

    test("statusOptions derives from loaded locations", async () => {
      const state = makeState();
      mockFetch(200, fixture,);
      await state.load();
      expect(state.statusOptions(),).toEqual(["draft", "published",],);
    });
  });

  describe("selectLoc detail cache", () => {
    test("cache hit skips the network call", async () => {
      const state = makeState();
      mockFetch(200, {
        data: {
          id: "loc-1",
          name: "Tavern",
          description: null,
          parent_location_id: null,
          state: null,
          connections: [],
          parent: null,
        },
      },);
      await state.selectLoc("loc-1",);
      const callsAfterFirst = fetchCalls.length;
      await state.selectLoc("loc-1",);
      expect(fetchCalls.length,).toBe(callsAfterFirst,);
      expect(state.detail?.id,).toBe("loc-1",);
    });
  });

  describe("tree shape", () => {
    test("roots returns only top-level locations; childrenOf returns direct descendants", async () => {
      const state = makeState();
      mockFetch(200, fixture,);
      await state.load();
      const roots = state.roots.map((l,) => l.id).sort();
      expect(roots,).toEqual(["loc-1", "loc-2",],);
      const children = state.childrenOf("loc-1",).map((l,) => l.id);
      expect(children,).toEqual(["loc-3",],);
      expect(state.hasChildren("loc-1",),).toBe(true,);
      expect(state.hasChildren("loc-2",),).toBe(false,);
    });

    test("toggleExpand flips the expanded flag", () => {
      const state = makeState();
      expect(state.isExpanded("loc-1",),).toBe(false,);
      state.toggleExpand("loc-1",);
      expect(state.isExpanded("loc-1",),).toBe(true,);
      state.toggleExpand("loc-1",);
      expect(state.isExpanded("loc-1",),).toBe(false,);
    });
  });
});
