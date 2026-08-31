import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Actor Memories ──────────────────────────────────
  await database.schema
    .createTable("actor_memories",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("source_chat_id", "text", (col,) => col.references("chats.id",),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("memory_type", "text", (col,) => col.notNull().defaultTo("fact",),)
    .addColumn("confidence", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("importance", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("keywords", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .execute();

  await database.schema.createIndex("idx_actor_memories_actor",).on("actor_memories",).column("actor_id",).execute();
  await database.schema.createIndex("idx_actor_memories_type",).on("actor_memories",).column("memory_type",).execute();
  await database.schema.createIndex("idx_actor_memories_source_chat",).on("actor_memories",).column("source_chat_id",)
    .execute();

  // ── Actor Notes ──────────────────────────────────────
  await database.schema
    .createTable("actor_notes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull().defaultTo("general",),)
    .addColumn("pinned", "text", (col,) => col.notNull().defaultTo("unpinned",),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema.createIndex("idx_actor_notes_actor",).on("actor_notes",).column("actor_id",).execute();

  // ── Actor Items ──────────────────────────────────────
  await database.schema
    .createTable("actor_items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("item_type", "text", (col,) => col.notNull(),)
    .addColumn("quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("value", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("weight", "real",)
    .addColumn("tags", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("equipped", "text", (col,) => col.notNull().defaultTo("unequipped",),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint(
      "ck_actor_items_type",
      sql`item_type IN ('weapon','armor','consumable','key_item','quest_item','material','tool','container','treasure','book','artifact','misc','other')`,
    )
    .execute();

  await database.schema.createIndex("idx_actor_items_actor",).on("actor_items",).column("actor_id",).execute();

  // ── Actor Currencies (trade/eco balances per world) ────
  await database.schema
    .createTable("actor_currencies",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("currency_type", "text", (col,) => col.notNull(),)
    .addColumn("balance", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_actor_currencies_balance", sql`balance >= 0`,)
    .execute();

  await database.schema
    .createIndex("idx_actor_currencies_actor_world",)
    .on("actor_currencies",)
    .columns(["actor_id", "world_id",],)
    .execute();

  // ── Actor Lore Entries (character_book) ──────────────
  await database.schema
    .createTable("actor_lore_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("name", "text",)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("keys", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("secondary_keys", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("selective", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("case_sensitive", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("enabled", "text", (col,) => col.notNull().defaultTo("enabled",),)
    .addColumn("constant", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("position", "text", (col,) => col.notNull().defaultTo("before_char",),)
    .addColumn("insertion_order", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("comment", "text",)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint(
      "ck_ale_enabled",
      sql`enabled IN ('enabled', 'disabled', 'archived')`,
    )
    .execute();

  await database.schema.createIndex("idx_actor_lore_actor",).on("actor_lore_entries",).column("actor_id",).execute();
  await database.schema.createIndex("idx_actor_lore_position",).on("actor_lore_entries",).column("position",).execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_actor_currencies_actor_world",).execute();
  await database.schema.dropTable("actor_currencies",).execute();
  await database.schema.dropTable("actor_lore_entries",).execute();
  await database.schema.dropTable("actor_items",).execute();
  await database.schema.dropTable("actor_notes",).execute();
  await database.schema.dropTable("actor_memories",).execute();
}
