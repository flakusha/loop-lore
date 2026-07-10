import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // ── Assets ─────────────────────────────────────────────────
  await database.schema
    .createTable("assets")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("owner_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("filename", "text", (col) => col.notNull())
    .addColumn("mime_type", "text", (col) => col.notNull())
    .addColumn("asset_type", "text", (col) => col.notNull())
    .addColumn("size_bytes", "integer", (col) => col.notNull())
    .addColumn("storage_path", "text", (col) => col.notNull())
    .addColumn("storage_backend", "text", (col) => col.notNull().defaultTo("local"))
    .addColumn("width", "integer")
    .addColumn("height", "integer")
    .addColumn("duration_secs", "real")
    .addColumn("alt_text", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await database.schema.createIndex("idx_assets_owner").on("assets").column("owner_id").execute();

  // ── Asset Links (polymorphic) ─────────────────────────────
  await database.schema
    .createTable("asset_links")
    .addColumn("asset_id", "text", (col) => col.notNull().references("assets.id"))
    .addColumn("entity_type", "text", (col) => col.notNull())
    .addColumn("entity_id", "text", (col) => col.notNull())
    .addColumn("label", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addPrimaryKeyConstraint("pk_asset_links", ["asset_id", "entity_type", "entity_id"])
    .execute();

  await database.schema.createIndex("idx_asset_links_entity").on("asset_links").columns(["entity_type", "entity_id"]).execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("asset_links").execute();
  await database.schema.dropTable("assets").execute();
}
