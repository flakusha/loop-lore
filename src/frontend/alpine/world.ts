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
import { worldLore, } from "./world-lore";
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
 * Mixin slices carrying live getters. They must NOT be object-spread into
 * the state: spreading INVOKES each getter at composition time with the
 * slice itself as `this` (no `locations`, no `worldId`) and freezes its
 * result. Instead the getters' property descriptors are defined onto the
 * finished state, keeping them live with `this` bound to the full state.
 */
const MIXIN_SLICES = [
  locationDetails,
  locationActions,
  travelInterface,
  timeWeatherWidget,
  worldLore,
] as const;

const MIXIN_DESCRIPTORS = Object.assign(
  {},
  ...MIXIN_SLICES.map((slice,) => Object.getOwnPropertyDescriptors(slice,)),
);

/**
 * @param {string} worldId
 * @returns {WorldPageState}
 */
function coreState(worldId: string,): WorldPageState {
  // The cast covers the mixin props this literal omits (they arrive via
  // MIXIN_DESCRIPTORS in buildWorldPageState below).
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

    /**
     * @returns {() => void}
     */
    init(this: WorldPageState,) {
      void this.loadWorld();
      void this.loadLocations();
      void this.loadWorldChats();
      void this.loadTravelStatus();
      void this.loadLore();
      this.connectConditionsStream();

      return () => {
        this._conditionsSse?.close();
        this._conditionsSse = null;
      };
    },

    /** @returns {Promise<void>} */
    async loadWorld(this: WorldPageState,) {
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
    async loadLocations(this: WorldPageState,) {
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
    connectConditionsStream(this: WorldPageState,) {
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
    applyConditions(this: WorldPageState, snapshot: WorldConditionsSnapshot,) {
      this.timeOfDay = snapshot.timeOfDay;
      this.weather = snapshot.weather;
      this.conditionsLocationName = snapshot.sampledLocationName;
      this.conditionsAt = snapshot.sampledAt;
    },

    /**
     * @param {string} id
     * @returns {WorldLocationLite | undefined}
     */
    locationById(this: WorldPageState, id: string,): WorldLocationLite | undefined {
      return this.locations.find((l,) => l.id === id);
    },

    /**
     * @param {WorldLocationLite} location
     * @returns {string[]}
     */
    connectionIdsOf(this: WorldPageState, location: WorldLocationLite,): string[] {
      return parseJsonList(location.connections,);
    },
  } as unknown as WorldPageState;
}

/**
 * @param {string} worldId
 * @returns {WorldPageState}
 */
export function buildWorldPageState(worldId: string,): WorldPageState {
  return Object.defineProperties(coreState(worldId,), MIXIN_DESCRIPTORS,);
}

(globalThis as unknown as { worldState?: (id: string,) => WorldPageState }).worldState = buildWorldPageState;
