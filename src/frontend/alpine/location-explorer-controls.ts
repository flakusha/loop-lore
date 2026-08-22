// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Location Explorer — UI controls mixin.
 *
 * Spread into the `locationExplorerState` factory alongside the core
 * data fields. Provides the filter-management getters + actions and
 * the throttled hover-preview/navigate UI helpers used by the
 * `world-edit.html` Explore tab.
 *
 * Kept separate from `location-explorer.ts` so the core data layer
 * stays under the 250L size-strict gate.
 */
import type { ExplorerLocation, ExplorerLocationState, } from "./location-explorer";

interface ExplorerControlState {
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

export const locationExplorerControls = {
  // ── Filter option refresh ───────────────────────────────
  // Distinct non-null values from loaded location_states, used to
  // populate the dropdown options. Sorted for stable UI order.
  _refreshOptionLists(this: ExplorerControlState,) {
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

  /**
   * Distinct publication_status values from loaded locations.
   * Method (not getter) because spreads eagerly invoke getters with
   * an empty `this` — calling sites use `state.statusOptions()`.
   */
  statusOptions(this: ExplorerControlState,): string[] {
    const seen = new Set<string>();
    for (const l of this.locations) { if (l.publication_status) { seen.add(l.publication_status,); } }
    return Array.from(seen,).sort();
  },

  /**
   * True when any filter differs from its default.
   * Drives the "Clear filters" affordance in the UI.
   */
  hasActiveFilters(this: ExplorerControlState,): boolean {
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

  clearFilters(this: ExplorerControlState,) {
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
  // burn detail fetches. Cancelled if the user moves to another row.
  hoverLoc(this: ExplorerControlState, locId: string,) {
    this._hoveredLocId = locId;
    if (typeof window !== "undefined") {
      window.clearTimeout(this._hoverTimer,);
      this._hoverTimer = window.setTimeout(() => {
        if (this._hoveredLocId === locId) { void this.selectLoc(locId,); }
      }, 350,);
    }
  },

  leaveLoc(this: ExplorerControlState,) {
    this._hoveredLocId = "";
    if (typeof window !== "undefined") { window.clearTimeout(this._hoverTimer,); }
  },

  // ── Quick navigation ───────────────────────────────────
  // Deep-link to the chat anchored on this location. Best-effort —
  // resolves client-side via the existing chat-list / chat-location
  // routes; falls back to the world's public chat when none is bound.
  navigateTo(this: ExplorerControlState, locId: string,) {
    const url = `/worlds/${this.worldId}/locations/${locId}`;
    if (typeof window !== "undefined") { window.location.href = url; }
  },
};
