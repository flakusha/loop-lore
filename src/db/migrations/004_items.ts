import type { Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
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
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_items_world").on("items").column("world_id").execute();
  await database.schema.createIndex("idx_items_category").on("items").column("category").execute();

  // ── World Items (items placed in locations / carried by NPCs) ─
  await database.schema
    .createTable("world_items")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("item_id", "text", (col) => col.notNull().references("items.id"))
    .addColumn("location_id", "text", (col) => col.references("locations.id"))
    .addColumn("owner_actor_id", "text", (col) => col.references("actors.id"))
    .addColumn("quantity", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("is_hidden", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("spawn_condition", "text")
    .addColumn("respawnable", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_world_items_world").on("world_items").column("world_id").execute();
  await database.schema.createIndex("idx_world_items_location").on("world_items").column("location_id").execute();
  await database.schema.createIndex("idx_world_items_owner").on("world_items").column("owner_actor_id").execute();
  await database.schema.createIndex("idx_world_items_item").on("world_items").column("item_id").execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("world_items").execute();
  await database.schema.dropTable("items").execute();
}