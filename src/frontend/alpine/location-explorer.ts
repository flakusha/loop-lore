// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Location Explorer + Details — world edit page component ──
//
// Standalone Alpine component (`x-data="locationExplorerState(worldId)"`)
// mounted on the world edit page. Loads all of a world's locations + location
// states via the explorer API, renders a hierarchical tree (by
// parent_location_id), and shows a detail pane for the selected location.
// It is read-only — location CRUD lives in the Locations tab (world-locations.ts).
import { jsonParseOr, } from "../../utils";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "location-explorer", },);

export interface ExplorerLocation {
  id: string;
  name: string;
  description: string | null;
  parent_location_id: string | null;
  connections: string;
  publication_status: string;
}

export interface ExplorerLocationState {
  location_id: string;
  atmosphere: string | null;
  description_override: string | null;
  npcs_present: string;
  items_available: string;
  time_of_day: string | null;
  weather: string | null;
  hazards: string;
}

export interface ExplorerDetail {
  id: string;
  name: string;
  description: string | null;
  parent_location_id: string | null;
  state: ExplorerLocationState | null;
  connections: { id: string; name: string }[];
  parent: { id: string; name: string } | null;
}

const safeParseList = (raw: string,): string[] => {
  const v = jsonParseOr(raw, null,);
  return Array.isArray(v,) ? v as string[] : [];
};

(globalThis as any).locationExplorerState = function(worldId: string,) {
  return {
    worldId,
    locations: [] as ExplorerLocation[],
    states: [] as ExplorerLocationState[],
    loading: false,
    loaded: false,
    error: false,
    search: "",
    selectedLocId: "" as string | null,
    detail: null as ExplorerDetail | null,
    expandedIds: {} as Record<string, boolean>,
    // ── Filter fields (all optional / empty = no filter) ──
    filterStatus: "" as string,
    filterHasState: "" as "" | "yes" | "no",
    filterAtmosphere: "" as string,
    filterWeather: "" as string,
    filterTimeOfDay: "" as string,
    filterTopLevelOnly: false,
    // Distinct option values derived from current locations + states
    atmosphereOptions: [] as string[],
    weatherOptions: [] as string[],
    timeOfDayOptions: [] as string[],
    // ── Hover preview (throttled) ──
    _hoverTimer: 0 as number,
    _hoveredLocId: "" as string | null,
    _detailCache: {} as Record<string, ExplorerDetail>,

    init() {
      this.load();
      this._refreshOptionLists();
    },

    get roots(): ExplorerLocation[] {
      const out: ExplorerLocation[] = [];
      for (const l of this.locations) { if (!l.parent_location_id) { out.push(l,); } }
      return out;
    },

    childrenOf(id: string,): ExplorerLocation[] {
      const out: ExplorerLocation[] = [];
      for (const l of this.locations) { if (l.parent_location_id === id) { out.push(l,); } }
      return out;
    },

    isExpanded(id: string,): boolean {
      return this.expandedIds[id] === true;
    },

    toggleExpand(id: string,) {
      this.expandedIds[id] = !this.expandedIds[id];
    },

    get filteredLocations(): ExplorerLocation[] {
      const q = this.search.trim().toLowerCase();
      const status = this.filterStatus;
      const hasState = this.filterHasState;
      const atmosphere = this.filterAtmosphere;
      const weather = this.filterWeather;
      const timeOfDay = this.filterTimeOfDay;
      const topLevelOnly = this.filterTopLevelOnly;
      const stateByLoc: Record<string, ExplorerLocationState | undefined> = {};
      for (const s of this.states) { stateByLoc[s.location_id] = s; }
      const out: ExplorerLocation[] = [];
      for (const l of this.locations) {
        // Search
        if (q) {
          const inName = l.name.toLowerCase().includes(q,);
          const inDesc = (l.description || "").toLowerCase().includes(q,);
          if (!inName && !inDesc) { continue; }
        }
        // Status
        if (status && l.publication_status !== status) { continue; }
        // Top-level only
        if (topLevelOnly && l.parent_location_id) { continue; }
        // State-driven filters (skip if state absent — only filter when state has value)
        const state = stateByLoc[l.id];
        if (hasState === "yes" && !state) { continue; }
        if (hasState === "no" && state) { continue; }
        if (atmosphere && state?.atmosphere !== atmosphere) { continue; }
        if (weather && state?.weather !== weather) { continue; }
        if (timeOfDay && state?.time_of_day !== timeOfDay) { continue; }
        out.push(l,);
      }
      return out;
    },

    hasChildren(id: string,): boolean {
      return this.childrenOf(id,).length > 0;
    },

    locationStateFor(locationId: string,): ExplorerLocationState | undefined {
      return this.states.find((s,) => s.location_id === locationId);
    },

    async load() {
      this.loading = true;
      this.error = false;
      try {
        const res = await apiFetch(`/api/worlds/${this.worldId}/location-explorer`, {
          headers: { Accept: "application/json", },
        },);
        if (!res.ok) {
          this.error = true;
          return;
        }
        const body = await res.json();
        this.locations = (body.data?.locations as ExplorerLocation[]) || [];
        this.states = (body.data?.states as ExplorerLocationState[]) || [];
        this.loaded = true;
        this._refreshOptionLists();
        if (this.locations.length > 0 && !this.selectedLocId) {
          this.selectLoc(this.locations[0]!.id,);
        }
      } catch (error) {
        log.warn("location explorer load failed", { error: String(error,), },);
        this.error = true;
      }
      this.loading = false;
    },

    async selectLoc(locId: string,) {
      this.selectedLocId = locId;
      // Cache hit avoids round-trip on click-after-hover.
      const cached = this._detailCache[locId];
      if (cached) {
        this.detail = cached;
        return;
      }
      try {
        const res = await apiFetch(`/api/worlds/${this.worldId}/locations/${locId}/details`, {
          headers: { Accept: "application/json", },
        },);
        if (!res.ok) { return; }
        const body = await res.json();
        const detail = body.data as ExplorerDetail;
        this.detail = detail;
        this._detailCache[locId] = detail;
      } catch (error) {
        log.warn("location detail load failed", { error: String(error,), },);
      }
    },

    connectionNames(loc: ExplorerLocation,): string {
      const ids = safeParseList(loc.connections,);
      const byId: Record<string, string> = {};
      for (const l of this.locations) { byId[l.id] = l.name; }
      return Array.from(ids, (id,) => byId[id] ?? id,).join(", ",);
    },

    npcList(loc: ExplorerLocation,): string[] {
      const state = this.locationStateFor(loc.id,);
      return state ? safeParseList(state.npcs_present,) : [];
    },

    // ── Filter option refresh ───────────────────────────────
    // Distinct non-null values from loaded location_states, used to
    // populate the dropdown options. Sorted for stable UI order.
    _refreshOptionLists() {
      const atmospheres = new Set<string>();
      const weathers = new Set<string>();
      const times = new Set<string>();
      for (const s of this.states) {
        if (s.atmosphere) { atmospheres.add(s.atmosphere,); }
        if (s.weather) { weathers.add(s.weather,); }
        if (s.time_of_day) { times.add(s.time_of_day,); }
      }
      this.atmosphereOptions = Array.from(atmospheres,).sort();
      this.weatherOptions = Array.from(weathers,).sort();
      this.timeOfDayOptions = Array.from(times,).sort();
    },

    /** Distinct publication_status values from loaded locations. */
    get statusOptions(): string[] {
      const seen = new Set<string>();
      for (const l of this.locations) { if (l.publication_status) { seen.add(l.publication_status,); } }
      return Array.from(seen,).sort();
    },

    /** True when any filter differs from its default (used to show a "Clear filters" affordance). */
    get hasActiveFilters(): boolean {
      return Boolean(
        this.search.trim() ||
        this.filterStatus ||
        this.filterHasState ||
        this.filterAtmosphere ||
        this.filterWeather ||
        this.filterTimeOfDay ||
        this.filterTopLevelOnly,
      );
    },

    clearFilters() {
      this.search = "";
      this.filterStatus = "";
      this.filterHasState = "";
      this.filterAtmosphere = "";
      this.filterWeather = "";
      this.filterTimeOfDay = "";
      this.filterTopLevelOnly = false;
    },

    // ── Hover-preview (throttled) ──────────────────────────
    // Delay before selectLoc fires on mouseenter, so casual sweeps don't
    // burn detail fetches. Cancelled if user moves to another row.
    hoverLoc(locId: string,) {
      this._hoveredLocId = locId;
      if (typeof window !== "undefined") {
        window.clearTimeout(this._hoverTimer,);
        this._hoverTimer = window.setTimeout(() => {
          if (this._hoveredLocId === locId) { void this.selectLoc(locId,); }
        }, 350,);
      }
    },

    leaveLoc() {
      this._hoveredLocId = "";
      if (typeof window !== "undefined") { window.clearTimeout(this._hoverTimer,); }
    },

    // ── Quick navigation ───────────────────────────────────
    // Deep-link to the chat that currently anchors this location, falling
    // back to the world's public chat when no specific chat is bound.
    // Both URLs are best-effort — they resolve client-side via the
    // existing chat-list / chat-location routes.
    navigateTo(locId: string,) {
      const url = `/worlds/${this.worldId}/locations/${locId}`;
      if (typeof window !== "undefined") { window.location.href = url; }
    },

  };
};
