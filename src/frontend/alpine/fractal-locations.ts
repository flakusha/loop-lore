// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Fractal Locations UI — world edit page ───────────────
//
// Alpine component (`x-data="fractalLocationsState(worldId)"`) mounted on the
// world edit page. Loads the recursive location tree + travel routes from the
// new fractal endpoints, lets the user attach/detach a transport to a route
// and create a new route inline. Read-only on the tree itself — full CRUD on
// locations lives in the Locations tab.

import { jsonStringifyOr, } from "../../utils/safe-json";
import { apiFetch, } from "./htmx";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "fractal-locations", },);

interface TreeNode {
  id: string;
  name: string;
  parent_location_id: string | null;
  children: TreeNode[];
}

interface RouteRow {
  id: string;
  name: string;
  kind: string;
  loop: number;
  seconds_per_unit: number;
}

interface RouteDetail extends RouteRow {
  stops: Array<{
    id: string;
    location_id: string;
    stop_order: number;
    dwell_seconds: number;
    coord_x: number | null;
    coord_y: number | null;
    coord_z: number | null;
  }>;
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
  readonly flatLocations: Array<{ id: string; label: string; depth: number }>;
  init(): void;
  loadTree(): Promise<void>;
  loadRoutes(): Promise<void>;
  selectRoute(routeId: string,): Promise<void>;
  createRoute(): Promise<void>;
  attachTransport(): Promise<void>;
  detachTransport(locId: string, routeId: string,): Promise<void>;
}

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

    init() {
      this.loadTree();
      this.loadRoutes();
    },

    async loadTree() {
      this.loadingTree = true;
      this.error = false;
      try {
        const res = await apiFetch(`/api/worlds/${this.worldId}/locations/tree`, {
          headers: { Accept: "application/json", },
        },);
        if (!res.ok) {
          this.error = true;
          return;
        }
        const body = await res.json();
        this.tree = (body?.data ?? []) as TreeNode[];
        this.loadedTree = true;
      } catch (e) {
        log.warn("tree load failed", { error: String(e,), },);
        this.error = true;
      } finally {
        this.loadingTree = false;
      }
    },

    async loadRoutes() {
      this.loadingRoutes = true;
      try {
        const res = await apiFetch(`/api/worlds/${this.worldId}/travel-routes`, {
          headers: { Accept: "application/json", },
        },);
        if (!res.ok) { return; }
        const body = await res.json();
        this.routes = (body?.data ?? []) as RouteRow[];
        this.loadedRoutes = true;
        if (this.routes.length > 0 && !this.selectedRouteId) {
          await this.selectRoute(this.routes[0]!.id,);
        }
      } catch (e) {
        log.warn("routes load failed", { error: String(e,), },);
      } finally {
        this.loadingRoutes = false;
      }
    },

    async selectRoute(routeId: string,) {
      this.selectedRouteId = routeId;
      this.routeDetail = null;
      try {
        const res = await apiFetch(`/api/worlds/${this.worldId}/travel-routes/${routeId}`, {
          headers: { Accept: "application/json", },
        },);
        if (!res.ok) { return; }
        const body = await res.json();
        this.routeDetail = body?.data as RouteDetail;
      } catch (e) {
        log.warn("route detail load failed", { error: String(e,), },);
      }
    },

    async createRoute() {
      if (!this.newRoute.name.trim()) { return; }
      this.creatingRoute = true;
      try {
        // hint: Logic changed on both sides. Requires understanding intent of each change.
        const res = await apiFetch(`/api/worlds/${this.worldId}/travel-routes`, {
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

    async attachTransport() {
      if (!this.attachLocationId || !this.attachRouteId) { return; }
      this.attaching = true;
      try {
        const res = await apiFetch(
          `/api/worlds/${this.worldId}/travel-routes/${this.attachRouteId}/attach/${this.attachLocationId}`,
          { method: "POST", headers: { Accept: "application/json", }, },
        );
        if (!res.ok) { return; }
        this.attachLocationId = "";
        await this.loadRoutes();
      } finally {
        this.attaching = false;
      }
    },

    async detachTransport(locId: string, routeId: string,) {
      const res = await apiFetch(
        `/api/worlds/${this.worldId}/travel-routes/${routeId}/attach/${locId}`,
        { method: "DELETE", headers: { Accept: "application/json", }, },
      );
      if (res.ok) { await this.loadRoutes(); }
    },
  };
}

(globalThis as unknown as { fractalLocationsState?: (id: string,) => FractalState }).fractalLocationsState =
  buildFractalState;
