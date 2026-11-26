import { afterAll, afterEach, describe, expect, test, } from "bun:test";
import type { ExplorerDetail, ExplorerLocation, ExplorerLocationState, } from "./location-explorer";
import { kindOptions, } from "./location-explorer-controls";

// ── apiFetch is a global registered by ./htmx at module load; we override
// it here because the SUT references it via the global, not a static import.
// The pre-file value is restored after the suite so the override never leaks
// into later files in a shared-process serial run.
const originalApiFetch = (globalThis as { apiFetch?: unknown }).apiFetch;
afterAll(() => {
  (globalThis as { apiFetch?: unknown }).apiFetch = originalApiFetch;
},);

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
  viewMode: string;
  setViewMode(mode: string,): void;
  filterStatus: string;
  filterHasState: "" | "yes" | "no";
  filterAtmosphere: string;
  filterWeather: string;
  filterTimeOfDay: string;
  filterKind: string;
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
  filteredIds: Set<string>;
  visibleRoots: ExplorerLocation[];
  visibleChildrenOf(id: string,): ExplorerLocation[];
  visibleLocations: ExplorerLocation[];
  isVisible(id: string,): boolean;
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

const chainFixture = {
  data: {
    locations: [
      {
        id: "a",
        name: "Region",
        description: null,
        parent_location_id: null,
        connections: "[]",
        publication_status: "draft",
        kind: "region",
      },
      {
        id: "b",
        name: "Settlement",
        description: null,
        parent_location_id: "a",
        connections: "[]",
        publication_status: "draft",
        kind: "settlement",
      },
      {
        id: "c",
        name: "Building",
        description: null,
        parent_location_id: "b",
        connections: "[]",
        publication_status: "draft",
        kind: "building",
      },
      {
        id: "d",
        name: "Room",
        description: null,
        parent_location_id: "c",
        connections: "[]",
        publication_status: "draft",
        kind: "room",
      },
    ],
    states: [],
  },
};

const kindFixture = {
  data: {
    locations: [
      {
        id: "k1",
        name: "Port",
        description: null,
        parent_location_id: null,
        connections: "[]",
        publication_status: "draft",
        kind: "transit",
      },
      {
        id: "k2",
        name: "Ship",
        description: null,
        parent_location_id: null,
        connections: "[]",
        publication_status: "draft",
        kind: "transport",
      },
      {
        id: "k3",
        name: "Cabin",
        description: null,
        parent_location_id: "k2",
        connections: "[]",
        publication_status: "draft",
        kind: "room",
      },
    ],
    states: [],
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

  describe("view mode", () => {
    test("defaults to tree and only accepts tree/grid", () => {
      const state = makeState();
      expect(state.viewMode,).toBe("tree",);
      state.setViewMode("grid",);
      expect(state.viewMode,).toBe("grid",);
      state.setViewMode("bogus",);
      expect(state.viewMode,).toBe("grid",);
    });
  });

  describe("hierarchical visibility", () => {
    test("expand/collapse hides and shows descendants across four levels", async () => {
      const state = makeState();
      mockFetch(200, chainFixture,);
      await state.load();
      const visible = () => state.visibleLocations.map((l,) => l.id);

      expect(visible(),).toEqual(["a",],);
      expect(state.visibleChildrenOf("a",),).toEqual([],);
      expect(state.isVisible("d",),).toBe(false,);

      state.toggleExpand("a",);
      expect(visible(),).toEqual(["a", "b",],);
      state.toggleExpand("b",);
      expect(visible(),).toEqual(["a", "b", "c",],);
      state.toggleExpand("c",);
      expect(visible(),).toEqual(["a", "b", "c", "d",],);
      expect(state.isVisible("d",),).toBe(true,);

      state.toggleExpand("b",);
      expect(visible(),).toEqual(["a", "b",],);
      expect(state.isVisible("c",),).toBe(false,);
      expect(state.isVisible("d",),).toBe(false,);

      state.toggleExpand("b",);
      expect(visible(),).toEqual(["a", "b", "c", "d",],);
      state.toggleExpand("a",);
      expect(visible(),).toEqual(["a",],);
      expect(state.visibleRoots.map((l,) => l.id),).toEqual(["a",],);
    });

    test("filteredLocations stays flat while the visible tree is hierarchical", async () => {
      const state = makeState();
      mockFetch(200, chainFixture,);
      await state.load();
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["a", "b", "c", "d",],);
      expect(state.visibleLocations.map((l,) => l.id),).toEqual(["a",],);
      expect(state.filteredIds.size,).toBe(4,);
    });

    test("filterTopLevelOnly hides descendants from the visible tree too", async () => {
      const state = makeState();
      mockFetch(200, chainFixture,);
      await state.load();
      state.toggleExpand("a",);
      state.toggleExpand("b",);
      state.toggleExpand("c",);
      expect(state.visibleLocations.map((l,) => l.id),).toEqual(["a", "b", "c", "d",],);
      state.filterTopLevelOnly = true;
      expect(state.visibleLocations.map((l,) => l.id),).toEqual(["a",],);
      expect(state.isVisible("b",),).toBe(false,);
    });
  });

  describe("kind filter", () => {
    test("kindOptions covers All plus every fractal kind in order", () => {
      expect([...kindOptions,],).toEqual([
        "All",
        "Region",
        "Settlement",
        "Building",
        "Room",
        "Transit",
        "Transport",
        "Pocket",
      ],);
    });

    test("filterKind selects only transport nodes, case-insensitively", async () => {
      const state = makeState();
      mockFetch(200, kindFixture,);
      await state.load();
      state.filterKind = "Transport";
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["k2",],);
      state.filterKind = "transport";
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["k2",],);
      state.filterKind = "All";
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["k1", "k2", "k3",],);
      state.filterKind = "";
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["k1", "k2", "k3",],);
    });

    test("kind filter composes with search/top-level and clearFilters resets it", async () => {
      const state = makeState();
      mockFetch(200, kindFixture,);
      await state.load();
      state.filterKind = "Transport";
      state.search = "ship";
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["k2",],);
      state.filterTopLevelOnly = true;
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["k2",],);
      state.search = "cabin";
      expect(state.filteredLocations,).toEqual([],);
      expect(state.hasActiveFilters(),).toBe(true,);
      state.clearFilters();
      expect(state.filterKind,).toBe("",);
      expect(state.hasActiveFilters(),).toBe(false,);
      expect(state.filteredLocations.map((l,) => l.id),).toEqual(["k1", "k2", "k3",],);
    });
  });
});
