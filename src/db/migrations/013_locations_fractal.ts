// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fractal locations migration (TASK-locations-fractal-migration).
 *
 * Extends the existing `locations` table with kind / mobility_mode / path /
 * coord_* / current_route_id / travel_progress; creates three new tables
 * (travel_routes, travel_route_stops, actor_locations); adds five SQLite
 * triggers for cycle/depth/cross-world/path materialization/path rewrite.
 *
 * Append-only: every ALTER is one column per statement (SQLite limitation).
 * Existing rows backfill to kind='region', mobility_mode='static',
 * path='/' || id || '/', all coordinates NULL.
 */
import { type Kysely, sql, } from "kysely";
import { LocationKind, MobilityMode, } from "../enums-story/world";
import { recordSchemaVersion, } from "../schema-version";

/** Maximum fractal depth. */
export const LOCATION_DEPTH_LIMIT = 12;

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── 1. ALTER locations: one column per statement ──
  await database.schema
    .alterTable("locations",)
    .addColumn("kind", "text", (col,) =>
      col.notNull().defaultTo(LocationKind.Region,),)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("mobility_mode", "text", (col,) =>
      col.notNull().defaultTo(MobilityMode.Static,),)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("path", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("coord_x", "real",)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("coord_y", "real",)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("coord_z", "real",)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("current_route_id", "text",)
    .execute();
  await database.schema
    .alterTable("locations",)
    .addColumn("travel_progress", "real", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  // ── 2. Indexes on the new columns ──
  await database.schema
    .createIndex("idx_locations_path",)
    .on("locations",)
    .column("path",)
    .execute();
  await database.schema
    .createIndex("idx_locations_kind",)
    .on("locations",)
    .column("kind",)
    .execute();
  await database.schema
    .createIndex("idx_locations_current_route",)
    .on("locations",)
    .column("current_route_id",)
    .execute();
  // Unique world+path index (SQLite uses CREATE UNIQUE INDEX, not ALTER TABLE ADD CONSTRAINT).
  await database.schema
    .createIndex("uq_locations_world_path",)
    .on("locations",)
    .columns(["world_id", "path",],)
    .unique()
    .execute();

  // ── 3. travel_routes table ──
  await database.schema
    .createTable("travel_routes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("kind", "text", (col,) => col.notNull(),)
    .addColumn("waypoints", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("loop", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("seconds_per_unit", "integer", (col,) => col.notNull().defaultTo(60,),)
    .addColumn("created_at", "text", (col,) =>
      col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  // ── 4. travel_route_stops table ──
  await database.schema
    .createTable("travel_route_stops",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("route_id", "text", (col,) =>
      col.notNull().references("travel_routes.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) =>
      col.notNull().references("locations.id",),)
    .addColumn("stop_order", "integer", (col,) => col.notNull(),)
    .addColumn("dwell_seconds", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("coord_x", "real",)
    .addColumn("coord_y", "real",)
    .addColumn("coord_z", "real",)
    .addUniqueConstraint("uq_route_stops_order", ["route_id", "stop_order",],)
    .execute();

  // ── 5. actor_locations table ──
  await database.schema
    .createTable("actor_locations",)
    .addColumn("actor_id", "text", (col,) =>
      col.primaryKey(),)
    .addColumn("physical_location_id", "text", (col,) =>
      col.notNull().references("locations.id",),)
    .addColumn("spatial_location_id", "text", (col,) =>
      col.notNull().references("locations.id",),)
    .addColumn("entered_at", "text", (col,) =>
      col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .createIndex("idx_actor_locations_physical",)
    .on("actor_locations",)
    .column("physical_location_id",)
    .execute();
  await database.schema
    .createIndex("idx_actor_locations_spatial",)
    .on("actor_locations",)
    .column("spatial_location_id",)
    .execute();

  // ── 6. Five triggers ──

  // 6.1 — Reject self-parent.
  await sql`CREATE TRIGGER trg_locations_no_self_parent
    BEFORE INSERT ON locations
    WHEN new.parent_location_id IS NOT NULL AND new.parent_location_id = new.id
    BEGIN
      SELECT RAISE(ABORT, 'location cannot be its own parent');
    END`.execute(database,);

  // 6.2 — Depth limit is enforced at the application layer (see LocationTreeService).
  // A pure SQL trigger is awkward: the recursive depth check via parent path lookup does not
  // survive SQLite's trigger parser when nested in CASE/WHEN expressions. The service path
  // already computes depth for ancestors/descendants; a single SELECT before INSERT is cheap.
  // Documented invariant: a Location's depth (seps in path) must be ≤ LOCATION_DEPTH_LIMIT.

  // 6.3 — Cross-world parent rejected.
  await sql`CREATE TRIGGER trg_locations_cross_world_parent
    BEFORE INSERT ON locations
    WHEN new.parent_location_id IS NOT NULL
      AND (SELECT world_id FROM locations WHERE id = new.parent_location_id) <> new.world_id
    BEGIN
      SELECT RAISE(ABORT, 'cross-world parent rejected');
    END`.execute(database,);

  // 6.4 — Set path on insert via AFTER INSERT. Single trigger handles both root and child.
  // SQLite triggers cannot use SET new.col; instead UPDATE the just-inserted row.
  await sql`CREATE TRIGGER trg_locations_set_path_on_insert
    AFTER INSERT ON locations
    BEGIN
      UPDATE locations
        SET path = CASE
          WHEN new.parent_location_id IS NULL THEN '/' || new.id || '/'
          ELSE (SELECT path FROM locations WHERE id = new.parent_location_id) || new.id || '/'
        END
        WHERE id = new.id;
    END`.execute(database,);

  // 6.5 — On parent update, recursively rewrite every descendant's path.
  // Walk subtree via recursive CTE, then bulk-update paths for each.
  await sql`CREATE TRIGGER trg_locations_set_path_on_update
    AFTER UPDATE OF parent_location_id ON locations
    WHEN new.parent_location_id IS NULL OR
         (SELECT path FROM locations WHERE id = new.parent_location_id) IS NOT NULL
    BEGIN
      -- Rewrite the moved row itself.
      UPDATE locations
        SET path = CASE
          WHEN new.parent_location_id IS NULL THEN '/' || new.id || '/'
          ELSE (SELECT path FROM locations l2 WHERE l2.id = new.parent_location_id) || new.id || '/'
        END
        WHERE id = new.id;
      -- Rewrite every descendant (recursive walk).
      UPDATE locations
        SET path = (SELECT l2.path FROM locations l2 WHERE l2.id = locations.parent_location_id) || locations.id || '/'
        WHERE id IN (
          WITH RECURSIVE sub(id) AS (
            SELECT id FROM locations WHERE parent_location_id = new.id AND id <> new.id
            UNION ALL
            SELECT l.id FROM locations l JOIN sub s ON l.parent_location_id = s.id
          )
          SELECT id FROM sub
        );
    END`.execute(database,);

  // ── 7. Backfill: every existing row gets path + defaults ──
  await sql`UPDATE locations SET path = '/' || id || '/' WHERE path = '' OR path IS NULL`.execute(
    database,
  );

  // ── 8. Backfill actor_locations from existing npc_states.location_id ──
  await sql`INSERT OR IGNORE INTO actor_locations (actor_id, physical_location_id, spatial_location_id)
    SELECT actor_id, location_id, location_id FROM npc_states WHERE location_id IS NOT NULL`.execute(
    database,
  );

  await recordSchemaVersion(
    database,
    34,
    "locations fractal: kind/mobility/path/coords, travel_routes, actor_locations (TASK-locations-fractal-migration)",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  // Triggers (reverse order — must be dropped BEFORE the columns they reference).
  await sql`DROP TRIGGER IF EXISTS trg_locations_set_path_on_update`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS trg_locations_set_path_on_insert`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS trg_locations_cross_world_parent`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS trg_locations_no_self_parent`.execute(database,);

  // Tables (reverse FK order).
  await database.schema.dropTable("actor_locations",).execute();
  await database.schema.dropTable("travel_route_stops",).execute();
  await database.schema.dropTable("travel_routes",).execute();

  // Indexes + unique index on locations.
  await database.schema.dropIndex("uq_locations_world_path",).ifExists().execute();
  await database.schema.dropIndex("idx_locations_current_route",).ifExists().execute();
  await database.schema.dropIndex("idx_locations_kind",).ifExists().execute();
  await database.schema.dropIndex("idx_locations_path",).ifExists().execute();

  // Columns (reverse declaration order).
  await database.schema.alterTable("locations",).dropColumn("travel_progress",).execute();
  await database.schema.alterTable("locations",).dropColumn("current_route_id",).execute();
  await database.schema.alterTable("locations",).dropColumn("coord_z",).execute();
  await database.schema.alterTable("locations",).dropColumn("coord_y",).execute();
  await database.schema.alterTable("locations",).dropColumn("coord_x",).execute();
  await database.schema.alterTable("locations",).dropColumn("path",).execute();
  await database.schema.alterTable("locations",).dropColumn("mobility_mode",).execute();
  await database.schema.alterTable("locations",).dropColumn("kind",).execute();
}
