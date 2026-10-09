// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 340

// ── Location Graph Editor — world edit page ─────────────
//
// Alpine component (`x-data="locationGraphState(worldId)"`) mounted on the
// world edit page's Edges tab (TASK-location-graph-editor-and-discovery-
// gating). Owner/admin view over the 047 adjacency graph:
//
//   - connect two locations by picking origin + destination + mode
//     (form-based "connect two nodes"; no canvas drag — noted deviation)
//   - per-edge attribute editor: mode, gameHours, requiresDiscovery, cost
//   - delete edge
//
// Backend seams: LocationEdgeService CRUD via
// /api/v1/worlds/:worldId/locations/:locId/edges and /worlds/:worldId/edges.

import { Type, } from "@sinclair/typebox";
import { jsonStringifyOr, safeJsonParse, } from "../../utils/safe-json";
import { apiFetch, } from "./htmx";
import { log as rootLog, } from "./logger";
import { parseOr, } from "./validation";
import { fetchWorldJson, } from "./world-fetch";

const log = rootLog.child({ module: "location-graph", },);

/** Wire shape of one location_edges row (booleans decoded server-side). */
const EdgeSchema = Type.Object({
  id: Type.String(),
  from_id: Type.String(),
  to_id: Type.String(),
  mode: Type.String(),
  game_hours: Type.Number(),
  requires_discovery: Type.Boolean(),
  cost: Type.Record(Type.String(), Type.Any(),),
},);

/** One selectable node in the connect form. */
interface GraphNode {
  id: string;
  name: string;
}

/** Draft form for a new edge. */
interface NewEdgeDraft {
  fromId: string;
  toId: string;
  mode: string;
  gameHours: number;
  requiresDiscovery: boolean;
  costJson: string;
}

/** Draft form for editing an existing edge. */
export interface EditEdgeDraft {
  mode: string;
  gameHours: number;
  requiresDiscovery: boolean;
  costJson: string;
}

/** All traversal modes the backend accepts (047 check constraint). */
const EDGE_MODE_OPTIONS = ["walk", "ride", "fly", "teleport", "port-gate", "free-jump",] as const;

/** Wire shape of one location_edges row (booleans decoded server-side). */
export interface GraphEdgeRow {
  id: string;
  from_id: string;
  to_id: string;
  mode: string;
  game_hours: number;
  requires_discovery: boolean;
  cost: Record<string, unknown>;
}

export interface LocationGraphState {
  worldId: string;
  nodes: GraphNode[];
  edges: GraphEdgeRow[];
  loading: boolean;
  loaded: boolean;
  error: boolean;
  busy: boolean;
  modeOptions: readonly string[];
  newEdge: NewEdgeDraft;
  editDrafts: Record<string, EditEdgeDraft>;
  readonly nodeNames: Record<string, string>;
  init(): void;
  load(): Promise<void>;
  createEdge(): Promise<void>;
  edgeMutation(edgeId: string, init: RequestInit,): Promise<boolean>;
  startEdit(edgeId: string,): void;
  editDraftOf(edgeId: string,): EditEdgeDraft;
  saveEdit(edgeId: string,): Promise<void>;
  deleteEdge(edgeId: string,): Promise<void>;
  costLabel(cost: Record<string, unknown>,): string;
}

/**
 * @param {string} text raw editor content
 * @returns {Record<string, unknown>} parsed object, or {} when blank/invalid
 */
function parseCostJson(text: string,): Record<string, unknown> {
  const parsed = safeJsonParse<unknown>(text,);
  const value = parsed.ok ? parsed.value : undefined;
  return typeof value === "object" && value !== null && !Array.isArray(value,)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * @param {string} worldId
 * @returns {LocationGraphState}
 */
export function buildLocationGraphState(worldId: string,): LocationGraphState {
  return {
    worldId,
    nodes: [],
    edges: [],
    loading: false,
    loaded: false,
    error: false,
    busy: false,
    modeOptions: EDGE_MODE_OPTIONS,
    newEdge: {
      fromId: "",
      toId: "",
      mode: "walk",
      gameHours: 1,
      requiresDiscovery: false,
      costJson: "",
    },
    editDrafts: {},

    /** Location ids → names for row labels. */
    get nodeNames(): Record<string, string> {
      const out: Record<string, string> = {};
      for (const n of this.nodes) { out[n.id] = n.name; }
      return out;
    },

    /**
     * @returns {void}
     */
    init() {
      void this.load();
    },

    /**
     * @returns {Promise<void>}
     */
    async load() {
      this.loading = true;
      this.error = false;
      try {
        const treeBody = await fetchWorldJson<{ data?: Array<Record<string, unknown>> }>(
          this.worldId,
          "/locations/tree",
        );

        const flat: GraphNode[] = [];
        const walk = (nodes: Array<Record<string, unknown>>,): void => {
          for (const n of nodes) {
            if (typeof n.id === "string" && typeof n.name === "string") {
              flat.push({ id: n.id, name: n.name, },);
            }

            if (Array.isArray(n.children,)) { walk(n.children as Array<Record<string, unknown>>,); }
          }
        };

        walk(treeBody?.data ?? [],);

        const graphBody = await fetchWorldJson<{ data?: unknown[] }>(this.worldId, "/edges",);
        this.edges = parseOr(Type.Array(EdgeSchema,), graphBody?.data ?? [], [],);
        this.nodes = flat;
        this.loaded = true;
      } catch (e) {
        this.error = true;
        log.warn("graph load failed", { error: String(e,), },);
      } finally {
        this.loading = false;
      }
    },

    /**
     * @returns {Promise<void>}
     */
    async createEdge() {
      const draft = this.newEdge;
      if (!draft.fromId || !draft.toId || draft.fromId === draft.toId) { return; }
      this.busy = true;
      try {
        const cost = draft.costJson.trim() === "" ? undefined : parseCostJson(draft.costJson,);
        const res = await apiFetch(
          `/api/v1/worlds/${this.worldId}/locations/${draft.fromId}/edges`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json", },
            body: jsonStringifyOr({
              toId: draft.toId,
              mode: draft.mode,
              gameHours: draft.gameHours,
              requiresDiscovery: draft.requiresDiscovery,
              ...(cost === undefined ? {} : { cost, }),
            },),
          },
        );

        if (!res.ok) {
          log.warn("edge create rejected", { status: res.status, },);
          return;
        }

        this.newEdge = {
          fromId: "",
          toId: "",
          mode: "walk",
          gameHours: 1,
          requiresDiscovery: false,
          costJson: "",
        };

        await this.load();
      } finally {
        this.busy = false;
      }
    },

    /**
     * @param {string} edgeId
     * @returns {void}
     */
    startEdit(edgeId: string,) {
      const edge = this.edges.find((e,) => e.id === edgeId);
      if (!edge) { return; }
      this.editDrafts[edgeId] = {
        mode: edge.mode,
        gameHours: edge.game_hours,
        requiresDiscovery: edge.requires_discovery,
        costJson: Object.keys(edge.cost,).length === 0 ? "" : jsonStringifyOr(edge.cost,),
      };
    },

    /**
     * @param {string} edgeId
     * @returns {EditEdgeDraft}
     */
    editDraftOf(edgeId: string,): EditEdgeDraft {
      return (
        this.editDrafts[edgeId] ?? { mode: "walk", gameHours: 1, requiresDiscovery: false, costJson: "", }
      );
    },

    /**
     * Shared PUT/DELETE scaffold: fetch, warn on rejection, then refresh the
     * graph and drop the editor draft. Resolves false when the API rejected.
     * @param {string} edgeId
     * @param {RequestInit} init
     * @returns {Promise<boolean>}
     */
    async edgeMutation(edgeId: string, init: RequestInit,): Promise<boolean> {
      this.busy = true;
      try {
        const res = await apiFetch(`/api/v1/worlds/${this.worldId}/edges/${edgeId}`, init,);
        if (!res.ok) {
          log.warn(`edge ${String(init.method ?? "GET",).toLowerCase()} rejected`, { status: res.status, },);
          return false;
        }

        delete this.editDrafts[edgeId];
        await this.load();
        return true;
      } finally {
        this.busy = false;
      }
    },

    /**
     * @param {string} edgeId
     * @returns {Promise<void>}
     */
    async saveEdit(edgeId: string,) {
      const draft = this.editDraftOf(edgeId,);
      const body: Record<string, unknown> = {
        mode: draft.mode,
        gameHours: draft.gameHours,
        requiresDiscovery: draft.requiresDiscovery,
      };

      if (draft.costJson.trim() !== "") {
        body.cost = parseCostJson(draft.costJson,);
      }

      await this.edgeMutation(edgeId, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json", },
        body: jsonStringifyOr(body,),
      },);
    },

    /**
     * @param {string} edgeId
     * @returns {Promise<void>}
     */
    async deleteEdge(edgeId: string,) {
      await this.edgeMutation(edgeId, { method: "DELETE", headers: { Accept: "application/json", }, },);
    },

    /**
     * @param {Record<string, unknown>} cost
     * @returns {string}
     */
    costLabel(cost: Record<string, unknown>,): string {
      const parts: string[] = [];
      if (typeof cost.gold === "number") { parts.push(`${cost.gold}g`,); }
      if (typeof cost.cooldownHours === "number") { parts.push(`${cost.cooldownHours}h cd`,); }
      if (typeof cost.itemId === "string") { parts.push(String(cost.itemId,),); }
      if (typeof cost.requiresFactionStanding === "string") {
        parts.push(`needs ${String(cost.requiresFactionStanding,)}`,);
      }

      return parts.join(", ",);
    },
  };
}

(globalThis as unknown as { locationGraphState?: (id: string,) => LocationGraphState }).locationGraphState =
  buildLocationGraphState;
