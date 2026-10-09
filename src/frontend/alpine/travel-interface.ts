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
import { estimateTravelMinutes, formatEta, resolveTravelMethod, } from "./travel-methods";
import { fetchWorldJson, } from "./world-fetch";
import type {
  TransportProgress,
  WorldEdgeLink,
  WorldLocationLite,
  WorldPageState,
} from "./world-types";

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
  edgeLinks: [],
  edgesLoaded: false,
  edgesLoading: false,

  /** @returns {Promise<void>} */
  async loadTravelStatus() {
    this.travelLoading = true;
    try {
      const body = await fetchWorldJson<{ data?: WorldPageState["travelStatus"] }>(this.worldId, "/travel/status",);
      if (body?.data) { this.travelStatus = body.data; }
    } finally {
      this.travelLoading = false;
    }
  },

  /**
   * Lazy-load the 047 adjacency edges once per page. The server filters
   * requires_discovery edges to the caller's latched subgraph, so players
   * only ever receive the discovered part of the graph here.
   * @returns {Promise<void>}
   */
  async loadGraphEdges() {
    if (this.edgesLoaded || this.edgesLoading) { return; }
    this.edgesLoading = true;
    try {
      const body = await fetchWorldJson<{ data?: WorldEdgeLink[] }>(this.worldId, "/edges",);
      this.edgeLinks = (body?.data ?? []).filter(
        (e,) => typeof e?.from_id === "string" && typeof e?.to_id === "string" && typeof e?.mode === "string",
      );

      this.edgesLoaded = true;
    } finally {
      this.edgesLoading = false;
    }
  },

  /** Direct 047 edge from the chosen origin to the chosen destination. */
  /** @returns {WorldEdgeLink | undefined} */
  get edgeToDestination(): WorldEdgeLink | undefined {
    if (!this.originId || !this.destinationId) { return undefined; }
    return this.edgeLinks.find(
      (e,) =>
        (e.from_id === this.originId && e.to_id === this.destinationId) ||
        (e.from_id === this.destinationId && e.to_id === this.originId),
    );
  },

  /** Destinations for the chosen origin: edge-connected first, then
   * connection-graph-connected, then the rest. Locked edges (invisible to
   * players) can never mark a destination connected. */
  /** @returns {WorldLocationLite[]} */
  get destinations(): WorldLocationLite[] {
    const others = this.locations.filter((l,) => l.id !== this.originId);
    const origin = this.locationById(this.originId,);
    if (!origin) { return others; }

    const connected = new Set(this.connectionIdsOf(origin,),);
    const edgeConnected = new Set(
      this.edgeLinks
        .filter((e,) => e.from_id === this.originId || e.to_id === this.originId)
        .map((e,) => (e.from_id === this.originId ? e.to_id : e.from_id)),
    );

    const rank = (id: string,): number => (edgeConnected.has(id,) ? 0 : connected.has(id,) ? 1 : 2);
    return [...others,].sort((x, y,) => rank(x.id,) - rank(y.id,));
  },

  /** True when origin and destination are directly connected: a 047 edge
   * (either direction) or a legacy connection-graph link. */
  /** @returns {boolean} */
  get travelConnected(): boolean {
    const origin = this.locationById(this.originId,);
    const destination = this.locationById(this.destinationId,);
    if (!origin || !destination) { return false; }
    return (
      this.edgeToDestination !== undefined ||
      this.connectionIdsOf(origin,).includes(destination.id,)
    );
  },

  /** Human ETA for the current origin/destination/method selection. An
   * explicit edge wins: its game_hours IS the trip length (estimate note
   * still applies — game hours ≠ wall clock). */
  /** @returns {string} */
  get travelEtaLabel(): string {
    const origin = this.locationById(this.originId,);
    const destination = this.locationById(this.destinationId,);
    if (!origin || !destination) { return "—"; }

    const edge = this.edgeToDestination;
    if (edge !== undefined) {
      return `${formatEta(edge.game_hours * 60,)} (${edge.mode}, est.)`;
    }

    const method = resolveTravelMethod(this.travelMethodId,);
    const hops = this.connectionIdsOf(origin,).includes(destination.id,) ? 1 : null;
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

  /** One-line summary of the direct edge for the travel panel. */
  /** @returns {string} */
  get edgeInfoLabel(): string {
    const edge = this.edgeToDestination;
    if (edge === undefined) { return ""; }
    return `Edge: ${edge.mode}, ${edge.game_hours} game h${
      edge.requires_discovery ? " (locked until discovered)" : ""
    }`;
  },

  /** @returns {TransportProgress[]} */
  get transportProgresses(): TransportProgress[] {
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
