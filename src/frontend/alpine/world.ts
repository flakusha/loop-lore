// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World page Alpine store (`x-data="worldState(worldId)"` on
 * world-detail.html) — TASK-world-alpine. Composes the location-details,
 * location-actions, travel-interface and time-weather mixins (the same
 * spread-mixin pattern worldEditState uses) and owns the shared core:
 *
 *   - world summary + location index loading
 *   - the conditions SSE subscription (routes/worlds/world-stream.ts);
 *     every `conditions` event updates the time/weather widget and
 *     refreshes travel status so progress/hazards follow world changes
 *
 * init() returns a cleanup closure (Alpine runs it on element removal) so
 * the EventSource never outlives the page.
 */
import { Type, } from "@sinclair/typebox";
import { jsonParseOr, } from "../../utils";
import { apiFetch, } from "./htmx";
import { locationActions, } from "./location-actions";
import { locationDetails, parseJsonList, } from "./location-details";
import { log as rootLog, } from "./logger";
import { timeWeatherWidget, } from "./time-weather";
import { travelInterface, } from "./travel-interface";
import { parseOr, } from "./validation";
import type {
  WorldConditionsSnapshot,
  WorldLocationLite,
  WorldPageState,
  WorldSummary,
} from "./world-types";

const log = rootLog.child({ module: "world", },);

/** Strict decoder for the SSE `conditions` event payload. */
const ConditionsEvent = Type.Object({
  timeOfDay: Type.Union([Type.String(), Type.Null(),],),
  weather: Type.Union([Type.String(), Type.Null(),],),
  sampledLocationId: Type.Union([Type.String(), Type.Null(),],),
  sampledLocationName: Type.Union([Type.String(), Type.Null(),],),
  sampledAt: Type.Union([Type.String(), Type.Null(),],),
},);

const EMPTY_CONDITIONS: WorldConditionsSnapshot = {
  timeOfDay: null,
  weather: null,
  sampledLocationId: null,
  sampledLocationName: null,
  sampledAt: null,
};

/**
 * @param {string} worldId
 * @returns {WorldPageState}
 */
export function buildWorldPageState(worldId: string,): WorldPageState {
  // The mixins are Partial slices; the spread below fills every member at
  // runtime, but TS cannot prove it — assert once, here, at the composition
  // point (the only place slices are merged).
  return {
    worldId,
    world: null,
    worldLoading: false,
    worldError: false,
    locations: [],
    locationsLoading: false,
    sseConnected: false,
    _conditionsSse: null,
    originId: "",
    destinationId: "",
    travelMethodId: "walk",
    travelStatus: null,
    travelLoading: false,
    showTravelConfirm: false,
    travelChatId: "",
    travelBusy: false,
    travelMessage: "",

    ...locationDetails,
    ...locationActions,
    ...travelInterface,
    ...timeWeatherWidget,

    /**
     * @returns {() => void}
     */
    init() {
      void this.loadWorld();
      void this.loadLocations();
      void this.loadWorldChats();
      void this.loadTravelStatus();
      this.connectConditionsStream();

      return () => {
        this._conditionsSse?.close();
        this._conditionsSse = null;
      };
    },

    /** @returns {Promise<void>} */
    async loadWorld() {
      this.worldLoading = true;
      this.worldError = false;
      try {
        const res = await apiFetch(`/api/v1/worlds/${this.worldId}`, {
          headers: { Accept: "application/json", },
        },);

        if (res.ok) {
          const data = (await res.json()) as Partial<WorldSummary>;
          this.world = {
            id: this.worldId,
            name: data.name ?? "",
            description: data.description ?? null,
            kind: data.kind ?? "rpg",
          };
        } else {
          this.worldError = true;
        }
      } catch (error) {
        log.warn("world load failed", { error: String(error,), },);
        this.worldError = true;
      } finally {
        this.worldLoading = false;
      }
    },

    /** @returns {Promise<void>} */
    async loadLocations() {
      this.locationsLoading = true;
      try {
        const res = await apiFetch(`/api/v1/worlds/${this.worldId}/locations?pageSize=500`, {
          headers: { Accept: "application/json", },
        },);

        if (res.ok) {
          const body = (await res.json()) as { data?: Partial<WorldLocationLite>[] };
          this.locations = (body.data ?? []).map((l,) => ({
            id: l.id ?? "",
            name: l.name ?? "",
            description: l.description ?? null,
            parent_location_id: l.parent_location_id ?? null,
            connections: typeof l.connections === "string" ? l.connections : "[]",
            coord_x: l.coord_x ?? null,
            coord_y: l.coord_y ?? null,
          }));

          // Sensible default origin once the graph is known.
          if (!this.originId && this.locations.length > 0) {
            this.originId = this.locations[0]!.id;
          }
        }
      } catch (error) {
        log.warn("world locations load failed", { error: String(error,), },);
      } finally {
        this.locationsLoading = false;
      }
    },

    /** @returns {void} */
    connectConditionsStream() {
      if (typeof EventSource === "undefined") { return; }
      this._conditionsSse?.close();

      const source = new EventSource(`/api/v1/worlds/${this.worldId}/stream`,);
      this._conditionsSse = source;

      source.addEventListener("open", () => {
        this.sseConnected = true;
      },);

      source.addEventListener("conditions", (ev: MessageEvent,) => {
        const snapshot = parseOr(ConditionsEvent, jsonParseOr(ev.data, null,), EMPTY_CONDITIONS,);
        this.applyConditions(snapshot,);
        // Conditions changed → hazards/stops may have too; refresh the feed.
        void this.loadTravelStatus();
      },);

      source.addEventListener("error", () => {
        // While the EventSource retries, the connection is not dead — only
        // a CLOSED source means the dashboard is truly offline.
        this.sseConnected = source.readyState !== EventSource.CLOSED;
      },);
    },

    /**
     * @param {WorldConditionsSnapshot} snapshot decoded SSE payload
     * @returns {void}
     */
    applyConditions(snapshot: WorldConditionsSnapshot,) {
      this.timeOfDay = snapshot.timeOfDay;
      this.weather = snapshot.weather;
      this.conditionsLocationName = snapshot.sampledLocationName;
      this.conditionsAt = snapshot.sampledAt;
    },

    /**
     * @param {string} id
     * @returns {WorldLocationLite | undefined}
     */
    locationById(id: string,): WorldLocationLite | undefined {
      return this.locations.find((l,) => l.id === id);
    },

    /**
     * @param {WorldLocationLite} location
     * @returns {string[]}
     */
    connectionIdsOf(location: WorldLocationLite,): string[] {
      return parseJsonList(jsonParseOr(location.connections, "[]",),);
    },
  } as WorldPageState;
}

(globalThis as unknown as { worldState?: (id: string,) => WorldPageState }).worldState = buildWorldPageState;
