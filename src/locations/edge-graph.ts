// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, type Selectable, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { LocationEdgeMode as LocationEdgeModeType, } from "../db/enums-story/world";
import type { DB, LocationEdges, } from "../db/schema";
import { jsonStringifyOr, } from "../utils/safe-json";
import { EDGE_MODE_SET, type EdgeCost, LocationEdgeError, parseEdgeCost, sqlStamp, } from "./edge-core";

/** A location_edges row as SELECT/RETURNING delivers it. */
export type EdgeRow = Selectable<LocationEdges>;

/** Edge attributes accepted from the graph editor. */
export interface EdgeAttributes {
  fromId: string;
  toId: string;
  mode: LocationEdgeModeType;
  /** Defaults to 1 in-game hour when omitted. */
  gameHours?: number;
  /** Defaults to openly traversable when omitted. */
  requiresDiscovery?: boolean;
  /** Defaults to a free edge when omitted. */
  cost?: EdgeCost;
}

/** Editable subset for edge updates; endpoints are immutable. */
export type EdgePatch = Partial<Pick<EdgeAttributes, "mode" | "gameHours" | "requiresDiscovery" | "cost">>;

/**
 * CRUD over the location adjacency graph (052_location_edges).
 * Travel-time enforcement lives in ./edge-travel; discovery gating and
 * hop eventing live in ./edge-discovery.
 */
export class LocationEdgeService {
  /** @param database Kysely handle */
  constructor(private readonly database: Kysely<DB>,) {}

  /**
   * Both endpoints must exist inside the claimed world; a self pair is
   * rejected outright.
   * @param worldId claimed world of the edge
   * @param fromId origin location
   * @param toId destination location
   * @throws {LocationEdgeError} "self", "not-found", or "cross-world"
   */
  async assertEndpoints(worldId: string, fromId: string, toId: string,): Promise<void> {
    if (fromId === toId) {
      throw new LocationEdgeError("self", "A location cannot connect to itself",);
    }

    const rows = await this.database
      .selectFrom("locations",)
      .select(["id", "world_id",],)
      .where("id", "in", [fromId, toId,],)
      .execute();

    const from = rows.find((r,) => r.id === fromId);
    const to = rows.find((r,) => r.id === toId);
    if (from === undefined || to === undefined) {
      throw new LocationEdgeError("not-found", "Location not found",);
    }

    if (from.world_id !== worldId || to.world_id !== worldId) {
      throw new LocationEdgeError("cross-world", "Edge endpoints must live in the same world",);
    }
  }

  /**
   * Create one directed edge. Both endpoints must exist in the same world;
   * self-edges and duplicate (from, to, mode) triples are rejected.
   * @param worldId world both endpoints live in
   * @param attrs fromId/toId/mode/gameHours/requiresDiscovery/cost
   * @returns {Promise<EdgeRow>} the inserted row
   * @throws {LocationEdgeError} "not-found", "cross-world", "self",
   *   "duplicate" or "bad-cost"
   */
  async createEdge(worldId: string, attrs: EdgeAttributes,): Promise<EdgeRow> {
    await this.assertEndpoints(worldId, attrs.fromId, attrs.toId,);

    const dupe = await this.database
      .selectFrom("location_edges",)
      .select("id",)
      .where("from_id", "=", attrs.fromId,)
      .where("to_id", "=", attrs.toId,)
      .where("mode", "=", attrs.mode,)
      .executeTakeFirst();

    if (dupe) {
      throw new LocationEdgeError("duplicate", "Edge already exists for this pair and mode",);
    }

    const id = randomUUID();
    await this.database
      .insertInto("location_edges",)
      .values({
        id,
        world_id: worldId,
        from_id: attrs.fromId,
        to_id: attrs.toId,
        mode: attrs.mode,
        game_hours: attrs.gameHours ?? 1,
        requires_discovery: (attrs.requiresDiscovery ?? false) ? 1 : 0,
        cost_json: jsonStringifyOr(attrs.cost ?? {},),
        updated_at: sqlStamp(new Date(),),
      },)
      .execute();

    const row = await this.edgeById(worldId, id,);
    if (row === undefined) {
      throw new LocationEdgeError("not-found", "Edge vanished after insert",);
    }

    return row;
  }

  /**
   * Update an edge's attributes. A mode change re-checks pair uniqueness.
   * @param worldId owning world
   * @param edgeId edge to update
   * @param patch partial attributes; endpoints are immutable
   * @returns {Promise<EdgeRow>} the updated row
   * @throws {LocationEdgeError} "not-found" or "duplicate"
   */
  async updateEdge(worldId: string, edgeId: string, patch: EdgePatch,): Promise<EdgeRow> {
    const existing = await this.edgeById(worldId, edgeId,);
    if (!existing) {
      throw new LocationEdgeError("not-found", "Edge not found",);
    }

    if (patch.mode !== undefined && !EDGE_MODE_SET.has(patch.mode,)) {
      throw new LocationEdgeError("bad-mode", `unknown edge mode: ${patch.mode}`,);
    }

    const cost = patch.cost === undefined ? undefined : parseEdgeCost(patch.cost,);

    const mode = patch.mode ?? existing.mode;
    if (mode !== existing.mode) {
      const dupe = await this.database
        .selectFrom("location_edges",)
        .select("id",)
        .where("from_id", "=", existing.from_id,)
        .where("to_id", "=", existing.to_id,)
        .where("mode", "=", mode,)
        .executeTakeFirst();

      if (dupe) {
        throw new LocationEdgeError("duplicate", "Edge already exists for this pair and mode",);
      }
    }

    await this.database
      .updateTable("location_edges",)
      .set({
        mode,
        game_hours: patch.gameHours ?? existing.game_hours,
        requires_discovery: patch.requiresDiscovery === undefined
          ? existing.requires_discovery
          : (patch.requiresDiscovery ? 1 : 0),
        cost_json: cost === undefined ? existing.cost_json : jsonStringifyOr(cost,),
        updated_at: sqlStamp(new Date(),),
      },)
      .where("id", "=", edgeId,)
      .where("world_id", "=", worldId,)
      .execute();

    const updated = await this.edgeById(worldId, edgeId,);
    if (updated === undefined) {
      throw new LocationEdgeError("not-found", "Edge not found",);
    }

    return updated;
  }

  /**
   * Delete one edge scoped to a world.
   * @param worldId owning world
   * @param edgeId edge to delete
   * @throws {LocationEdgeError} "not-found"
   */
  async deleteEdge(worldId: string, edgeId: string,): Promise<void> {
    const deleted = await this.database
      .deleteFrom("location_edges",)
      .where("id", "=", edgeId,)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();

    if (deleted.numDeletedRows === 0n) {
      throw new LocationEdgeError("not-found", "Edge not found",);
    }
  }

  /**
   * Read one edge scoped to a world.
   * @param worldId owning world
   * @param edgeId edge id
   * @returns {Promise<EdgeRow | undefined>} the row, when present
   */
  async edgeById(worldId: string, edgeId: string,): Promise<EdgeRow | undefined> {
    return await this.database
      .selectFrom("location_edges",)
      .selectAll()
      .where("id", "=", edgeId,)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();
  }

  /**
   * Every edge touching a location, in both directions.
   * @param locationId location to look around
   * @returns {Promise<EdgeRow[]>} adjacency in both directions
   */
  async edgesAt(locationId: string,): Promise<EdgeRow[]> {
    return await this.database
      .selectFrom("location_edges",)
      .selectAll()
      .where((eb,) => eb.eb("from_id", "=", locationId,).or("to_id", "=", locationId,))
      .execute();
  }
}
