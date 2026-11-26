// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 011_locations_factions_npc — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("location_states",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("description_override", "text",)
    .addColumn("atmosphere", "text",)
    .addColumn("npcs_present", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("items_available", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("time_of_day", "text",)
    .addColumn("weather", "text",)
    .addColumn("hazards", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("locations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("connections", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("publication_status", "text", (col,) => col.defaultTo("draft",).notNull(),)
    .addColumn("parent_location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("kind", "text", (col,) => col.defaultTo("region",).notNull(),)
    .addColumn("mobility_mode", "text", (col,) => col.defaultTo("static",).notNull(),)
    .addColumn("path", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("coord_x", "real",)
    .addColumn("coord_y", "real",)
    .addColumn("coord_z", "real",)
    .addColumn("current_route_id", "text",)
    .addColumn("travel_progress", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .execute();

  await database.schema
    .createTable("location_nsfw_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("location_type", "text", (col,) => col.notNull(),)
    .addColumn("privacy_level", "text", (col,) => col.defaultTo("private",).notNull(),)
    .addColumn("discovery_chance", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("atmosphere", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("equipment", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("risks", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_nsfw_config_location", ["location_id",],)
    .execute();

  await database.schema
    .createTable("travel_routes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("kind", "text", (col,) => col.notNull(),)
    .addColumn("waypoints", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("loop", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("seconds_per_unit", "integer", (col,) => col.defaultTo(60,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("travel_route_stops",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("route_id", "text", (col,) => col.notNull().references("travel_routes.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",),)
    .addColumn("stop_order", "integer", (col,) => col.notNull(),)
    .addColumn("dwell_seconds", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("coord_x", "real",)
    .addColumn("coord_y", "real",)
    .addColumn("coord_z", "real",)
    .addColumn("created_at", "text",)
    .addColumn("updated_at", "text",)
    .addUniqueConstraint("uq_route_stops_order", ["route_id", "stop_order",],)
    .execute();

  await database.schema
    .createTable("travel_parties",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("kind", "text", (col,) => col.defaultTo("patrol",).notNull(),)
    .addColumn("cadence", "text", (col,) => col.defaultTo("patrol",).notNull(),)
    .addColumn("route", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("route_index", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("steps_per_tick", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("travel_progress", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("current_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("current_tick", "integer", (col,) => col.defaultTo(-1,).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("idle",).notNull(),)
    .addColumn("blocked_until_tick", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_travel_parties_status", sql`status IN ('idle', 'traveling', 'resting', 'disbanded')`,)
    .execute();

  await database.schema
    .createTable("npc_migrations",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("origin_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("destination_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("depart_tick", "integer", (col,) => col.notNull(),)
    .addColumn("arrive_tick", "integer", (col,) => col.notNull(),)
    .addColumn("cadence", "text", (col,) => col.defaultTo("scheduled",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("planned",).notNull(),)
    .addColumn("last_depart_tick", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_npc_migrations_status", sql`status IN ('planned', 'in_transit', 'arrived')`,)
    .execute();

  await database.schema
    .createTable("location_discovery",)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("progress", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("last_explored_tick", "integer", (col,) => col.defaultTo(-1,).notNull(),)
    .addColumn("discovered", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("discovered_tick", "integer",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addPrimaryKeyConstraint("pk_location_discovery", ["world_id", "location_id", "actor_id",],)
    .addCheckConstraint("ck_location_discovery_progress", sql`progress >= 0 AND progress <= 100`,)
    .execute();

  await database.schema
    .createTable("location_edges",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("from_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("to_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("mode", "text", (col,) => col.defaultTo("walk",).notNull(),)
    .addColumn("game_hours", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("requires_discovery", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("cost_json", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint(
      "ck_location_edges_mode",
      sql`mode IN ('walk', 'ride', 'fly', 'teleport', 'port-gate', 'free-jump')`,
    )
    .addCheckConstraint("ck_location_edges_no_self", sql`from_id != to_id`,)
    .addUniqueConstraint("uq_location_edges_pair_mode", ["from_id", "to_id", "mode",],)
    .execute();

  await database.schema
    .createTable("location_anomalies",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.defaultTo("neutral",).notNull(),)
    .addColumn("stat_modifiers", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("damage_over_time", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("healing_over_time", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("experience_multiplier", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("loot_multiplier", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("special_effects", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("duration_seconds", "integer", (col,) => col.defaultTo(-1,).notNull(),)
    .addColumn("discovery_chance", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("discovered_at", "text",)
    .addColumn("interaction_required", "text", (col,) => col.defaultTo("optional",).notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_location_anomalies_type", sql`type IN ('positive', 'negative', 'neutral')`,)
    .addCheckConstraint("ck_location_anomalies_interaction", sql`interaction_required IN ('optional', 'required')`,)
    .addCheckConstraint("ck_location_anomalies_discovery_chance", sql`discovery_chance >= 0 AND discovery_chance <= 1`,)
    .execute();

  await database.schema
    .createTable("location_storage",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("capacity", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("security", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("access_control", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_location_storage_capacity", sql`capacity >= 0`,)
    .addCheckConstraint("ck_location_storage_security", sql`security >= 0 AND security <= 100`,)
    .execute();

  await database.schema
    .createTable("location_storage_items",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("storage_id", "text", (col,) => col.notNull().references("location_storage.id",).onDelete("cascade",),)
    .addColumn("item_id", "text", (col,) => col.notNull().references("items.id",).onDelete("cascade",),)
    .addColumn("quantity", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("stored_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_location_storage_items_quantity", sql`quantity > 0`,)
    .execute();

  await database.schema
    .createTable("map_zones",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("map_id", "text", (col,) => col.notNull().references("world_maps.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("zone_type", "text", (col,) => col.defaultTo("region",).notNull(),)
    .addColumn("x", "integer", (col,) => col.notNull(),)
    .addColumn("y", "integer", (col,) => col.notNull(),)
    .addColumn("width", "integer", (col,) => col.notNull(),)
    .addColumn("height", "integer", (col,) => col.notNull(),)
    .addColumn("z", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_map_zones_extent", sql`width >= 1 AND height >= 1`,)
    .execute();

  // raw index: idx_location_anomalies_expires
  await sql`CREATE INDEX "idx_location_anomalies_expires" on "location_anomalies" ("expires_at") where expires_at IS NOT NULL`
    .execute(database,);

  // raw index: idx_location_anomalies_location
  await sql`CREATE INDEX "idx_location_anomalies_location" on "location_anomalies" ("location_id")`.execute(database,);
  // raw index: idx_location_anomalies_world
  await sql`CREATE INDEX "idx_location_anomalies_world" on "location_anomalies" ("world_id")`.execute(database,);
  // raw index: idx_location_discovery_location
  await sql`CREATE INDEX "idx_location_discovery_location" on "location_discovery" ("world_id", "location_id")`.execute(
    database,
  );

  // raw index: idx_location_edges_from
  await sql`CREATE INDEX "idx_location_edges_from" on "location_edges" ("from_id")`.execute(database,);
  // raw index: idx_location_edges_to
  await sql`CREATE INDEX "idx_location_edges_to" on "location_edges" ("to_id")`.execute(database,);
  // raw index: idx_location_edges_world
  await sql`CREATE INDEX "idx_location_edges_world" on "location_edges" ("world_id")`.execute(database,);
  // raw index: idx_location_states_location
  await sql`CREATE INDEX "idx_location_states_location" on "location_states" ("location_id")`.execute(database,);
  // raw index: idx_location_states_world
  await sql`CREATE INDEX "idx_location_states_world" on "location_states" ("world_id")`.execute(database,);
  // raw index: idx_location_storage_items_storage_item
  await sql`CREATE UNIQUE INDEX "idx_location_storage_items_storage_item" on "location_storage_items" ("storage_id", "item_id")`
    .execute(database,);

  // raw index: idx_location_storage_location
  await sql`CREATE INDEX "idx_location_storage_location" on "location_storage" ("world_id", "location_id")`.execute(
    database,
  );

  // raw index: idx_locations_created_at
  await sql`CREATE INDEX "idx_locations_created_at" on "locations" ("created_at")`.execute(database,);
  // raw index: idx_locations_current_route
  await sql`CREATE INDEX "idx_locations_current_route" on "locations" ("current_route_id")`.execute(database,);
  // raw index: idx_locations_kind
  await sql`CREATE INDEX "idx_locations_kind" on "locations" ("kind")`.execute(database,);
  // raw index: idx_locations_parent
  await sql`CREATE INDEX "idx_locations_parent" on "locations" ("parent_location_id")`.execute(database,);
  // raw index: idx_locations_path
  await sql`CREATE INDEX "idx_locations_path" on "locations" ("path")`.execute(database,);
  // raw index: idx_locations_world
  await sql`CREATE INDEX "idx_locations_world" on "locations" ("world_id")`.execute(database,);
  // raw index: idx_map_zones_location
  await sql`CREATE INDEX "idx_map_zones_location" on "map_zones" ("location_id")`.execute(database,);
  // raw index: idx_map_zones_map
  await sql`CREATE INDEX "idx_map_zones_map" on "map_zones" ("map_id")`.execute(database,);
  // raw index: idx_npc_migrations_due
  await sql`CREATE INDEX "idx_npc_migrations_due" on "npc_migrations" ("world_id", "status", "arrive_tick")`.execute(
    database,
  );

  // raw index: idx_travel_parties_world
  await sql`CREATE INDEX "idx_travel_parties_world" on "travel_parties" ("world_id")`.execute(database,);
  // raw index: uq_locations_world_path
  await sql`CREATE UNIQUE INDEX "uq_locations_world_path" on "locations" ("world_id", "path")`.execute(database,);
  // raw trigger: trg_locations_cross_world_parent
  await sql`CREATE TRIGGER trg_locations_cross_world_parent
      BEFORE INSERT ON locations
      WHEN new.parent_location_id IS NOT NULL
        AND (SELECT world_id FROM locations WHERE id = new.parent_location_id) <> new.world_id
      BEGIN
        SELECT RAISE(ABORT, 'cross-world parent rejected');
      END`.execute(database,);

  // raw trigger: trg_locations_cross_world_parent_on_update
  await sql`CREATE TRIGGER trg_locations_cross_world_parent_on_update
    BEFORE UPDATE OF parent_location_id ON locations
    FOR EACH ROW
    WHEN NEW.parent_location_id IS NOT NULL
      AND (SELECT world_id FROM locations WHERE id = NEW.parent_location_id) IS NOT NULL
      AND (SELECT world_id FROM locations WHERE id = NEW.parent_location_id) <> NEW.world_id
    BEGIN
      SELECT RAISE(ABORT, 'cross-world parent rejected');
    END`.execute(database,);

  // raw trigger: trg_locations_depth_limit_on_insert
  await sql`CREATE TRIGGER trg_locations_depth_limit_on_insert
    BEFORE INSERT ON locations
    FOR EACH ROW
    WHEN (SELECT length(path) - length(replace(path, '/', ''))
          FROM locations WHERE id = NEW.parent_location_id) > 12
    BEGIN
      SELECT RAISE(ABORT, 'location depth exceeds limit (12)');
    END`.execute(database,);

  // raw trigger: trg_locations_depth_limit_on_update
  await sql`CREATE TRIGGER trg_locations_depth_limit_on_update
    BEFORE UPDATE OF parent_location_id ON locations
    FOR EACH ROW
    WHEN (SELECT length(path) - length(replace(path, '/', ''))
          FROM locations WHERE id = NEW.parent_location_id) > 12
    BEGIN
      SELECT RAISE(ABORT, 'location depth exceeds limit (12)');
    END`.execute(database,);

  // raw trigger: trg_locations_no_self_parent
  await sql`CREATE TRIGGER trg_locations_no_self_parent
      BEFORE INSERT ON locations
      WHEN new.parent_location_id IS NOT NULL AND new.parent_location_id = new.id
      BEGIN
        SELECT RAISE(ABORT, 'location cannot be its own parent');
      END`.execute(database,);

  // raw trigger: trg_locations_no_self_parent_on_update
  await sql`CREATE TRIGGER trg_locations_no_self_parent_on_update
    BEFORE UPDATE OF parent_location_id ON locations
    FOR EACH ROW
    WHEN NEW.parent_location_id IS NOT NULL AND NEW.parent_location_id = NEW.id
    BEGIN
      SELECT RAISE(ABORT, 'location cannot be its own parent');
    END`.execute(database,);

  // raw trigger: trg_locations_set_path_on_insert
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

  // raw trigger: trg_locations_set_path_on_update
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
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("map_zones",).execute();
  await database.schema.dropTable("location_storage_items",).execute();
  await database.schema.dropTable("location_storage",).execute();
  await database.schema.dropTable("location_anomalies",).execute();
  await database.schema.dropTable("location_edges",).execute();
  await database.schema.dropTable("location_discovery",).execute();
  await database.schema.dropTable("npc_migrations",).execute();
  await database.schema.dropTable("travel_parties",).execute();
  await database.schema.dropTable("travel_route_stops",).execute();
  await database.schema.dropTable("travel_routes",).execute();
  await database.schema.dropTable("location_nsfw_config",).execute();
  await database.schema.dropTable("locations",).execute();
  await database.schema.dropTable("location_states",).execute();
}
