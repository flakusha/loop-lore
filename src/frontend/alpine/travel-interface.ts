// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Travel interface mixin for the world page (TASK-travel-interface).
 *
 * - Available destinations: the origin's graph connections first, then the
 *   remaining locations (data from the locations list + details feeds)
 * - Travel time/distance: coordinate-based ETA per method (walk/ride/
 *   teleport), hop-count fallback for adjacent locations; estimates only
 * - Real travel action: moving one of the user's chats to the destination
 *   (PUT /chats/:id/location) — the platform's instant fast-travel; the
 *   walk/ride estimates are labeled as estimates in the UI
 * - Progress + fast-travel status: active transports (TravelTickEngine)
 *   and parties (world-travel simulation) from /travel/status, refreshed
 *   whenever the conditions SSE stream ticks
 */
import { apiFetch, } from "./htmx";
import { log as rootLog, } from "./logger";
import { estimateTravelMinutes, formatEta, resolveTravelMethod, } from "./travel-methods";
import type { WorldLocationLite, WorldPageState, } from "./world-types";

const log = rootLog.child({ module: "travel-interface", },);

/** Destination selection, ETA and status state for the world page. */
export const travelInterface: Partial<WorldPageState> & ThisType<WorldPageState> = {
  originId: "",
  destinationId: "",
  travelMethodId: "walk",
  travelStatus: null,
  travelLoading: false,
  showTravelConfirm: false,
  travelChatId: "",
  travelBusy: false,
  travelMessage: "",

  /** @returns {Promise<void>} */
  async loadTravelStatus() {
    this.travelLoading = true;
    try {
      const res = await apiFetch(`/api/v1/worlds/${this.worldId}/travel/status`, {
        headers: { Accept: "application/json", },
      },);

      if (res.ok) {
        const body = (await res.json()) as { data?: WorldPageState["travelStatus"] };
        this.travelStatus = body.data ?? { transports: [], parties: [], };
      }
    } catch (error) {
      log.warn("travel status load failed", { error: String(error,), },);
    } finally {
      this.travelLoading = false;
    }
  },

  /** Destinations for the chosen origin: connected locations first. */
  /** @returns {WorldLocationLite[]} */
  get destinations(): WorldLocationLite[] {
    const others = this.locations.filter((l,) => l.id !== this.originId);
    const origin = this.locationById(this.originId,);
    if (!origin) { return others; }

    const connected = new Set(this.connectionIdsOf(origin,),);
    return [
      ...others.filter((l,) => connected.has(l.id,)),
      ...others.filter((l,) => !connected.has(l.id,)),
    ];
  },

  /** True when origin and destination are directly connected in the graph. */
  /** @returns {boolean} */
  get travelConnected(): boolean {
    const origin = this.locationById(this.originId,);
    const destination = this.locationById(this.destinationId,);
    if (!origin || !destination) { return false; }
    return this.connectionIdsOf(origin,).includes(destination.id,);
  },

  /** Human ETA for the current origin/destination/method selection. */
  /** @returns {string} */
  get travelEtaLabel(): string {
    const origin = this.locationById(this.originId,);
    const destination = this.locationById(this.destinationId,);
    if (!origin || !destination) { return "—"; }

    const method = resolveTravelMethod(this.travelMethodId,);
    const hops = this.travelConnected ? 1 : null;
    // WorldLocationLite stores snake_case coords; adapt to TravelPoint.
    return formatEta(
      estimateTravelMinutes(
        { coordX: origin.coord_x, coordY: origin.coord_y, },
        { coordX: destination.coord_x, coordY: destination.coord_y, },
        method,
        hops,
      ),
    );
  },

  /** @returns {Array<{ name: string; pct: number; routeName: string; nextStopName: string | null; hazards: string[] }>} */
  get transportProgresses(): Array<{
    name: string;
    pct: number;
    routeName: string;
    nextStopName: string | null;
    hazards: string[];
  }> {
    return (this.travelStatus?.transports ?? []).map((t,) => ({
      name: t.name,
      routeName: t.routeName,
      pct: t.stopCount > 0 ? Math.min(100, Math.round((t.progress / t.stopCount) * 100,),) : 0,
      nextStopName: t.nextStopName,
      hazards: t.hazards,
    }));
  },

  /** @returns {WorldPageState["partyStatuses"]} */
  get partyStatuses(): WorldPageState["partyStatuses"] {
    return this.travelStatus?.parties ?? [];
  },

  /** @returns {void} */
  openTravelConfirm() {
    if (!this.destinationId) {
      showToast("error", "Choose a destination first",);
      return;
    }

    this.travelMessage = "";
    this.showTravelConfirm = true;
  },

  /** @returns {Promise<void>} */
  async confirmTravel() {
    if (!this.travelChatId) {
      this.travelMessage = "Select one of your chats to travel with.";
      return;
    }

    // The move itself (PUT /chats/:id/location + refresh) lives in the
    // location-actions mixin — the travel dialog is only its confirmation UI.
    await this.moveChatTo(this.travelChatId, this.destinationId,);
    if (!this.travelBusy) {
      this.showTravelConfirm = false;
    }
  },
};
