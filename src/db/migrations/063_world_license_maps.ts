// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 063_world_license_maps
 *
 * World-level shareability terms plus the 2D/3D map data model
 * (epic-worlds-extension, "world license" + "map data model").
 *
 *   - `world_licenses` — one row per world (UNIQUE) mirroring the
 *     `character_licensing` precedent (001): the license is either an SPDX
 *     identifier or a custom text, never both, and the use flags that make
 *     the world shareable travel with it. `attribution` / `allowed_use` /
 *     `prohibited_use` are JSON text columns, matching the `cost_json`
 *     convention already used by `location_edges` (053).
 *   - `world_maps` — one 2D or 3D surface for a world. `width`/`height` are
 *     tile counts; `z` lives on the zone, so a 2D map simply carries
 *     `z = 0` zones.
 *   - `map_zones` — a rectangular region of a map, optionally anchored to a
 *     fractal `locations.id`. The anchor is nullable so a map can be laid out
 *     before its zones are linked to the location graph.
 *
 * Coordinates: tile coordinates live in world-space shared with the rest of
 * the repo — `locations.coord_x` / `coord_y` / `coord_z` (nullable REAL,
 * from 001). `src/locations/positions.ts` models WHERE an actor IS (two
 * location ids), not a coordinate space, so `map_zones` anchors by
 * `location_id` and this module owns the arithmetic.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("world_licenses",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    /** "spdx" | "custom" — which of `spdx_id` / `license_text` is authoritative. */
    .addColumn("spdx_or_custom", "text", (col,) => col.notNull().defaultTo("custom",),)
    /** SPDX identifier, e.g. "CC-BY-4.0". Non-null only when spdx_or_custom='spdx'. */
    .addColumn("spdx_id", "text", (col,) => col.defaultTo(null,),)
    /** Full license text. Non-null only when spdx_or_custom='custom'. */
    .addColumn("license_text", "text", (col,) => col.defaultTo(null,),)
    /** JSON object: { author?, url?, notice? }. */
    .addColumn("attribution", "text", (col,) => col.notNull().defaultTo("{}",),)
    /** JSON array of granted use flags. */
    .addColumn("allowed_use", "text", (col,) => col.notNull().defaultTo("[]",),)
    /** JSON array of withheld use flags. */
    .addColumn("prohibited_use", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_world_licenses_kind", sql`spdx_or_custom IN ('spdx', 'custom')`,)
    .addCheckConstraint(
      "ck_world_licenses_payload",
      sql`(spdx_or_custom = 'spdx' AND spdx_id IS NOT NULL) OR (spdx_or_custom = 'custom' AND license_text IS NOT NULL)`,
    )
    .execute();

  await database.schema
    .createIndex("uq_world_licenses_world",)
    .unique()
    .on("world_licenses",)
    .column("world_id",)
    .execute();

  await database.schema
    .createTable("world_maps",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("map_type", "text", (col,) => col.notNull().defaultTo("2d",),)
    /** Tile columns. */
    .addColumn("width", "integer", (col,) => col.notNull(),)
    /** Tile rows. */
    .addColumn("height", "integer", (col,) => col.notNull(),)
    .addColumn("tile_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_world_maps_type", sql`map_type IN ('2d', '3d')`,)
    .addCheckConstraint("ck_world_maps_extent", sql`width > 0 AND height > 0`,)
    .execute();

  await database.schema
    .createIndex("idx_world_maps_world",)
    .on("world_maps",)
    .columns(["world_id",],)
    .execute();

  await database.schema
    .createTable("map_zones",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("map_id", "text", (col,) => col.notNull().references("world_maps.id",).onDelete("cascade",),)
    /** Fractal location this zone stands for; null until anchored. */
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("zone_type", "text", (col,) => col.notNull().defaultTo("region",),)
    /** Inclusive left tile. */
    .addColumn("x", "integer", (col,) => col.notNull(),)
    /** Inclusive top tile. */
    .addColumn("y", "integer", (col,) => col.notNull(),)
    /** Width in tiles (>= 1). */
    .addColumn("width", "integer", (col,) => col.notNull(),)
    /** Height in tiles (>= 1). */
    .addColumn("height", "integer", (col,) => col.notNull(),)
    /** Layer index; 0 on a 2D map. */
    .addColumn("z", "integer", (col,) => col.notNull().defaultTo(0,),)
    /** JSON object of zone-specific payload. */
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_map_zones_extent", sql`width >= 1 AND height >= 1`,)
    .execute();

  await database.schema
    .createIndex("idx_map_zones_map",)
    .on("map_zones",)
    .columns(["map_id",],)
    .execute();

  await database.schema
    .createIndex("idx_map_zones_location",)
    .on("map_zones",)
    .column("location_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_map_zones_location",).execute();
  await database.schema.dropIndex("idx_map_zones_map",).execute();
  await database.schema.dropTable("map_zones",).execute();
  await database.schema.dropIndex("idx_world_maps_world",).execute();
  await database.schema.dropTable("world_maps",).execute();
  await database.schema.dropIndex("uq_world_licenses_world",).execute();
  await database.schema.dropTable("world_licenses",).execute();
}
