// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Fractal Locations UI — world edit page ───────────────
//
// Alpine component (`x-data="fractalLocationsState(worldId)"`) mounted on the
// world edit page. Loads the recursive location tree + travel routes from the
// new fractal endpoints, lets the user attach/detach a transport to a route
// and create a new route inline. Read-only on the tree itself — full CRUD on
// locations lives in the Locations tab.

import { jsonStringifyOr, } from "../../utils";
import type { TravelRouteStopRow, } from "../../validation/schemas/travel-wire";
import { type BadgeMeta, renderTreeMarkup, type TreeNode, } from "./fractal-tree-render";
import { apiFetch, } from "./htmx";
import { kindOptions, } from "./location-explorer-controls";
import { log as rootLog, } from "./logger";
import { fetchWorldJson, } from "./world-fetch";

const log = rootLog.child({ module: "fractal-locations", },);

interface RouteRow {
  id: string;
  name: string;
  kind: string;
  loop: number;
  seconds_per_unit: number;
}

interface RouteDetail extends RouteRow {
  stops: TravelRouteStopRow[];
}

export interface FractalState {
  worldId: string;
  tree: TreeNode[];
  routes: RouteRow[];
  loadingTree: boolean;
  loadingRoutes: boolean;
  loadedTree: boolean;
  loadedRoutes: boolean;
  error: boolean;
  newRoute: { name: string; kind: string; loop: boolean; secondsPerUnit: number };
  creatingRoute: boolean;
  attachLocationId: string;
  attachRouteId: string;
  attaching: boolean;
  selectedRouteId: string;
  routeDetail: RouteDetail | null;
  filterKind: string;
  routeMeta: Record<string, BadgeMeta>;
  readonly flatLocations: Array<{ id: string; label: string; depth: number }>;
  init(): void;
  loadTree(): Promise<void>;
  loadRoutes(): Promise<void>;
  loadRouteMeta(): Promise<void>;
  selectRoute(routeId: string,): Promise<void>;
  createRoute(): Promise<void>;
  attachTransport(): Promise<void>;
  detachTransport(locId: string, routeId: string,): Promise<void>;
}

/**
 * @param {string} worldId
 * @returns {FractalState}
 */
export function buildFractalState(worldId: string,): FractalState {
  return {
    worldId,
    tree: [],
    routes: [],
    loadingTree: false,
    loadingRoutes: false,
    loadedTree: false,
    loadedRoutes: false,
    error: false,
    newRoute: { name: "", kind: "sea", loop: false, secondsPerUnit: 60, },
    creatingRoute: false,
    attachLocationId: "",
    attachRouteId: "",
    attaching: false,
    selectedRouteId: "",
    routeDetail: null,
    filterKind: "",
    routeMeta: {},

    get flatLocations(): Array<{ id: string; label: string; depth: number }> {
      const out: Array<{ id: string; label: string; depth: number }> = [];
      const walk = (nodes: TreeNode[], depth: number,) => {
        for (const n of nodes) {
          out.push({ id: n.id, label: `${"— ".repeat(depth,)}${n.name}`, depth, },);
          walk(n.children, depth + 1,);
        }
      };

      walk(this.tree, 0,);
      return out;
    },

    /**
     * @returns {void}
     */
    init() {
      this.loadTree();
      this.loadRoutes();
    },

    /**
     * @returns {Promise<void>}
     */
    async loadTree() {
      this.loadingTree = true;
      this.error = false;
      try {
        const body = await fetchWorldJson<{ data?: TreeNode[] }>(this.worldId, "/locations/tree",);
        if (body === null) {
          this.error = true;
          return;
        }

        this.tree = body.data ?? [];
        this.loadedTree = true;
      } catch {
        this.error = true;
      } finally {
        this.loadingTree = false;
      }
    },

    /**
     * @returns {Promise<void>}
     */
    async loadRoutes() {
      this.loadingRoutes = true;
      try {
        const body = await fetchWorldJson<{ data?: RouteRow[] }>(this.worldId, "/travel-routes",);
        if (body) {
          this.routes = body.data ?? [];
          this.loadedRoutes = true;
          await this.loadRouteMeta();
          if (this.routes.length > 0 && !this.selectedRouteId) {
            await this.selectRoute(this.routes[0]!.id,);
          }
        }
      } catch {
        log.warn("routes load failed",);
      } finally {
        this.loadingRoutes = false;
      }
    },

    /**
     * Cache a stop count per route so tree badges can compute ETA.
     * @returns {Promise<void>}
     */
    async loadRouteMeta() {
      for (const route of this.routes) {
        const body = this.routeMeta[route.id]
          ? null
          : await fetchWorldJson<{ data?: RouteDetail }>(
            this.worldId,
            `/travel-routes/${encodeURIComponent(route.id,)}`,
          );

        this.routeMeta[route.id] ??= [
          route.name,
          Math.max(body?.data?.stops?.length ?? 0, 1,),
          Math.max(route.seconds_per_unit, 1,),
        ];
      }
    },

    /**
     * @param {string} routeId
     * @returns {Promise<void>}
     */
    async selectRoute(routeId: string,) {
      this.selectedRouteId = routeId;
      this.routeDetail = null;
      try {
        const res = await apiFetch(`/api/v1/worlds/${this.worldId}/travel-routes/${routeId}`, {
          headers: { Accept: "application/json", },
        },);

        if (!res.ok) { return; }
        const body = await res.json();
        this.routeDetail = body?.data as RouteDetail;
      } catch (e) {
        log.warn("route detail load failed", { error: String(e,), },);
      }
    },

    /**
     * @returns {Promise<void>}
     */
    async createRoute() {
      if (!this.newRoute.name.trim()) { return; }
      this.creatingRoute = true;
      try {
        const res = await apiFetch(`/api/v1/worlds/${this.worldId}/travel-routes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", },
          body: jsonStringifyOr({
            name: this.newRoute.name.trim(),
            kind: this.newRoute.kind,
            loop: this.newRoute.loop,
            secondsPerUnit: this.newRoute.secondsPerUnit,
          },),
        },);

        if (!res.ok) { return; }
        this.newRoute = { name: "", kind: "sea", loop: false, secondsPerUnit: 60, };
        await this.loadRoutes();
      } finally {
        this.creatingRoute = false;
      }
    },

    /**
     * @returns {Promise<void>}
     */
    async attachTransport() {
      if (!this.attachLocationId || !this.attachRouteId) { return; }
      this.attaching = true;
      try {
        const res = await apiFetch(
          `/api/v1/worlds/${this.worldId}/travel-routes/${this.attachRouteId}/attach/${this.attachLocationId}`,
          { method: "POST", headers: { Accept: "application/json", }, },
        );

        if (!res.ok) { return; }
        this.attachLocationId = "";
        await this.loadRoutes();
      } finally {
        this.attaching = false;
      }
    },

    /**
     * @param {string} locId
     * @param {string} routeId
     * @returns {Promise<void>}
     */
    async detachTransport(locId: string, routeId: string,) {
      const res = await apiFetch(
        `/api/v1/worlds/${this.worldId}/travel-routes/${routeId}/attach/${locId}`,
        { method: "DELETE", headers: { Accept: "application/json", }, },
      );

      if (res.ok) { await this.loadRoutes(); }
    },
  };
}

const globals = globalThis as unknown as Record<string, unknown>;
globals.fractalLocationsState = buildFractalState;
globals.fractalKindOptions = kindOptions;
globals.fractalTreeMarkup = renderTreeMarkup;
