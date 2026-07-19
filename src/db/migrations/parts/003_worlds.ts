import { type Kysely, sql } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // ── Worlds ─────────────────────────────────────────────────
  await database.schema
    .createTable("worlds")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("owner_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("lore", "text")
    .addColumn("scan_depth", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("token_budget", "integer", (col) => col.notNull().defaultTo(2000))
    .addColumn("difficulty_modifier", "real", (col) => col.notNull().defaultTo(1))
    .addColumn("difficulty_reroll", "text", (col) => col.notNull().defaultTo("none"))
    .addColumn("difficulty_state", "text", (col) => col.notNull().defaultTo("alive"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  // ── Locations (sub-entities of worlds) ──────────────────────
  await database.schema
    .createTable("locations")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("connections", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("parent_location_id", "text", (col) => col.references("locations.id"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await database.schema.createIndex("idx_locations_world").on("locations").column("world_id").execute();
  await database.schema.createIndex("idx_locations_parent").on("locations").column("parent_location_id").execute();

  // ── Items (world-level item definitions) ───────────────────
  await database.schema
    .createTable("items")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("category", "text", (col) => col.notNull())
    .addColumn("rarity", "text", (col) => col.notNull().defaultTo("common"))
    .addColumn("stackable", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("max_stack", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("properties", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("value", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("weight", "real", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await database.schema.createIndex("idx_items_world").on("items").column("world_id").execute();
  await database.schema.createIndex("idx_items_category").on("items").column("category").execute();

  // ── World Lore Entries ───────────────────────────────
  await database.schema
    .createTable("world_lore_entries")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("name", "text")
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("keys", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("secondary_keys", "text", (col) => col.defaultTo("[]"))
    .addColumn("selective", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("case_sensitive", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("enabled", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("constant", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("position", "text", (col) => col.notNull().defaultTo("before_char"))
    .addColumn("insertion_order", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("priority", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("comment", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await database.schema.createIndex("idx_world_lore_world").on("world_lore_entries").column("world_id").execute();
  await database.schema.createIndex("idx_world_lore_position").on("world_lore_entries").column("position").execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("world_lore_entries").execute();
  await database.schema.dropTable("items").execute();
  await database.schema.dropTable("locations").execute();
  await database.schema.dropTable("worlds").execute();
}
