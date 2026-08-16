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

    init() {
      this.load();
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
      if (!q) { return this.locations; }
      const out: ExplorerLocation[] = [];
      for (const l of this.locations) {
        if (
          l.name.toLowerCase().includes(q,) ||
          (l.description || "").toLowerCase().includes(q,)
        ) {
          out.push(l,);
        }
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
      try {
        const res = await apiFetch(`/api/worlds/${this.worldId}/locations/${locId}/details`, {
          headers: { Accept: "application/json", },
        },);
        if (!res.ok) { return; }
        const body = await res.json();
        this.detail = body.data as ExplorerDetail;
      } catch (error) {
        log.warn("location detail load failed", { error: String(error,), },);
      }
    },

    connectionNames(loc: ExplorerLocation,): string {
      const ids = safeParseList(loc.connections,);
      const byId = new Map(Array.from(this.locations, (l,) => [l.id, l.name,],),);
      return Array.from(ids, (id,) => byId.get(id,) ?? id,).join(", ",);
    },

    npcList(loc: ExplorerLocation,): string[] {
      const state = this.locationStateFor(loc.id,);
      return state ? safeParseList(state.npcs_present,) : [];
    },
  };
};
