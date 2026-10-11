// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 053_location_edges
 *
 * First-class location adjacency graph
 * (TASK-location-travel-connected-fast-and-free-jump).
 *
 * `location_edges` — one directed, mode-specific link between two
 * locations. Distinct from the route-based travel system
 * (travel_routes/travel_route_stops, 001; travel_parties, 040): a route is
 * a long multi-stop path a party walks over ticks; an edge is a single
 * hop a player picks as connected travel. Modes: walk/ride/fly/teleport/
 * port-gate are adjacency travel; `free-jump` may link any two locations
 * and charges cost_json (gold, itemId, cooldownHours,
 * requiresFactionStanding).
 *
 * Discovery gating (TASK-location-graph-editor-and-discovery-gating) needs
 * no new table: `location_discovery` (041) already latches per-(location,
 * actor) visits in `discovered`. A `requires_discovery` edge becomes
 * travelable once BOTH endpoints are latched for the traveling actor.
 *
 * Numbering: authored as 051, then 052 after rebasing onto dev. Both were
 * taken (051_bdi_reflection_cadence_and_plan_visibility,
 * 052_world_timescale), so this is 053.
 *
 * The chain must stay gapless 001..N (migrations.test.ts), not merely
 * unique (check-migration-ordering.ts) — renumbering forward while 052
 * is free would leave a hole and every default gate would still pass,
 * because both migration suites are excluded from the gate runner by
 * default. Renumbered from 052 after epic-world-review finalized 052.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("location_edges",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql.raw("(lower(hex(randomblob(16))))",),),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("from_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("to_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("mode", "text", (col,) => col.notNull().defaultTo("walk",),)
    /** Travel time for the hop, in game hours. */
    .addColumn("game_hours", "real", (col,) => col.notNull().defaultTo(1,),)
    /** 1 = travelable only after BOTH endpoints are discovered (041 latch). */
    .addColumn("requires_discovery", "integer", (col,) => col.notNull().defaultTo(0,),)
    /** free-jump price tag: { gold, itemId, cooldownHours, requiresFactionStanding }. */
    .addColumn("cost_json", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql.raw("(datetime('now'))",),),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql.raw("(datetime('now'))",),),)
    .addCheckConstraint(
      "ck_location_edges_mode",
      sql.raw("mode IN ('walk', 'ride', 'fly', 'teleport', 'port-gate', 'free-jump')",),
    )
    .addCheckConstraint("ck_location_edges_no_self", sql.raw("from_id != to_id",),)
    .addUniqueConstraint("uq_location_edges_pair_mode", ["from_id", "to_id", "mode",],)
    .execute();

  await database.schema
    .createIndex("idx_location_edges_world",)
    .on("location_edges",)
    .columns(["world_id",],)
    .execute();

  await database.schema
    .createIndex("idx_location_edges_from",)
    .on("location_edges",)
    .columns(["from_id",],)
    .execute();

  await database.schema
    .createIndex("idx_location_edges_to",)
    .on("location_edges",)
    .columns(["to_id",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_location_edges_to",).execute();
  await database.schema.dropIndex("idx_location_edges_from",).execute();
  await database.schema.dropIndex("idx_location_edges_world",).execute();
  await database.schema.dropTable("location_edges",).execute();
}
