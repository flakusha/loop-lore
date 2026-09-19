// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tree Integrity Service — Fractal Locations (TASK-locations-tree-integrity-service).
 *
 * Wraps the location-tree integrity guarantees in a typed, tested API:
 *   - path materialization (single-row repair + recursive subtree walk)
 *   - ancestor / descendant / sibling navigation via recursive CTEs
 *   - subtree-move with cycle + cross-world rejection at the app layer
 *
 * The DB layer (triggers) already enforces:
 *   - cycle rejection (trg_locations_no_cycle on parent_location_id update)
 *   - depth limit (trg_locations_depth_limit, ≤ 12 per LOCATION_DEPTH_LIMIT)
 *   - cross-world parent (trg_locations_cross_world_parent)
 *   - path auto-materialization on insert (trg_locations_path_on_insert)
 *
 * This service exists for: (1) the tests that should pass without DB triggers
 * (e.g. in-memory repos, unit tests), (2) operations that need batched repair
 * after data corruption, (3) read-side queries (ancestors/descendants) that
 * the routes layer previously computed ad-hoc.
 */
import { randomUUID, } from "node:crypto";
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../db";
import { LOCATION_DEPTH_LIMIT, } from "../db/enums-story/world";

export interface LocationTreeNode {
  id: string;
  parent_location_id: string | null;
  path: string;
  depth: number;
}

export interface InsertLocationInput {
  worldId: string;
  name: string;
  description?: string;
  kind?: string;
  mobilityMode?: string;
  parentLocationId: string | null;
}

export class LocationTreeService {
  constructor(private readonly db: Kysely<DB>,) {}

  /** Compute the canonical path for a location, given its parent's path. */
  static computeChildPath(parentPath: string | null, childId: string,): string {
    // Strip trailing '/' from parent, then format as '/parent/child/' (canonical: leading + trailing).
    const base = parentPath === null ? "" : parentPath.replace(/\/$/, "",);
    return `${base}/${childId}/`;
  }

  /** Depth (separator count in path) of a given location. */
  static depth(parentPath: string | null,): number {
    if (parentPath === null || parentPath === "") { return 1; }
    return parentPath.split("/").length - 2; // '/a/' → 1 separator
  }

  /**
   * Insert a Location with depth + cross-world checks at the application layer.
   * The trigger on `path` materializes the path automatically. Returns the new id.
   */
  async insertLocation(input: InsertLocationInput,): Promise<string> {
    if (input.parentLocationId !== null) {
      const parent = await this.db
        .selectFrom("locations",)
        .where("id", "=", input.parentLocationId,)
        .select(["id", "world_id", "path",],)
        .executeTakeFirst();
      if (!parent) { throw new Error("parent location not found"); }
      if (parent.world_id !== input.worldId) { throw new Error("cross-world parent rejected"); }
      const prospectiveDepth = LocationTreeService.depth(parent.path,) + 1;
      if (prospectiveDepth > LOCATION_DEPTH_LIMIT) {
        throw new Error(`location depth exceeds limit (${LOCATION_DEPTH_LIMIT})`);
      }
    }
    const newId = randomUUID();
    await this.db
      .insertInto("locations",)
      .values({
        id: newId,
        world_id: input.worldId,
        name: input.name,
        description: input.description ?? "",
        connections: "[]",
        publication_status: "draft",
        kind: input.kind ?? "region",
        mobility_mode: input.mobilityMode ?? "static",
        parent_location_id: input.parentLocationId,
      } as never,)
      .execute();
    return newId;
  }

  /** Repair a single location's `path` from its parent_location_id (idempotent). */
  async repairPath(locationId: string,): Promise<string> {
    return await this.db.transaction().execute(async (trx,) => {
      const row = await trx
        .selectFrom("locations",)
        .where("id", "=", locationId,)
        .select(["id", "parent_location_id",],)
        .executeTakeFirst();
      if (!row) { return ""; }
      let parentPath: string | null = null;
      if (row.parent_location_id) {
        const parent = await trx
          .selectFrom("locations",)
          .where("id", "=", row.parent_location_id,)
          .select("path",)
          .executeTakeFirst();
        parentPath = parent?.path ?? null;
      }
      const newPath = LocationTreeService.computeChildPath(parentPath, row.id,);
      await trx.updateTable("locations",).where("id", "=", row.id,).set({ path: newPath, },).execute();
      return newPath;
    });
  }

  /** Walk up — root-most first (highest depth = closest to root), excludes self. */
  async getAncestors(locationId: string,): Promise<LocationTreeNode[]> {
    const result = await sql<LocationTreeNode>`
      WITH RECURSIVE chain(id, parent_location_id, path, depth) AS (
        SELECT l.id, l.parent_location_id, l.path, 0
          FROM locations l WHERE l.id = ${locationId}
        UNION ALL
        SELECT p.id, p.parent_location_id, p.path, c.depth + 1
          FROM locations p
          JOIN chain c ON c.parent_location_id = p.id
      )
      SELECT id, parent_location_id, path, depth FROM chain
       WHERE depth > 0 ORDER BY depth DESC
    `.execute(this.db,);
    return result.rows as LocationTreeNode[];
  }

  /** Walk down — direct children first. */
  async getDescendants(locationId: string,): Promise<LocationTreeNode[]> {
    const result = await sql<LocationTreeNode>`
      WITH RECURSIVE tree(id, parent_location_id, path, depth) AS (
        SELECT l.id, l.parent_location_id, l.path, 0
          FROM locations l WHERE l.id = ${locationId}
        UNION ALL
        SELECT c.id, c.parent_location_id, c.path, t.depth + 1
          FROM locations c
          JOIN tree t ON c.parent_location_id = t.id
      )
      SELECT id, parent_location_id, path, depth FROM tree
       WHERE depth > 0 ORDER BY depth, path
    `.execute(this.db,);
    return result.rows as LocationTreeNode[];
  }

  /** Move a subtree under a new parent (cross-world rejected; cycle rejected via trigger). */
  async moveSubtree(locationId: string, newParentId: string | null,): Promise<void> {
    if (newParentId === locationId) {
      throw new Error("location cannot be its own parent");
    }
    if (newParentId !== null) {
      // App-layer cross-world check (trigger enforces too; this catches pre-trigger validation paths).
      const rows = await this.db
        .selectFrom("locations",)
        .where("id", "in", [locationId, newParentId,],)
        .select(["id", "world_id",],)
        .execute();
      const self = rows.find((r,) => r.id === locationId,);
      const parent = rows.find((r,) => r.id === newParentId,);
      if (!self || !parent) { throw new Error("location or parent not found"); }
      if (self.world_id !== parent.world_id) {
        throw new Error("cross-world move rejected");
      }
      if (newParentId !== null) {
        const ancestors = await this.getAncestors(newParentId,);
        if (ancestors.some((a,) => a.id === locationId,)) {
          throw new Error("move would create a cycle");
        }
      }
    }
    await this.db.updateTable("locations",).where("id", "=", locationId,).set({
      parent_location_id: newParentId,
    },).execute();
  }
}
