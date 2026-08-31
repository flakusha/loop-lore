import { type Kysely, sql, } from "kysely";

/**
 * RPG Mechanics Tables
 *
 * Dice roll history, character stat blocks, XP tracking, loot tables.
 */

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Dice Roll History ──────────────────────────────────────

  await database.schema
    .createTable("dice_roll_history",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("chat_id", "text",)
    .addColumn("actor_id", "text",)
    .addColumn("sides", "integer", (col,) => col.notNull(),)
    .addColumn("count", "integer", (col,) => col.notNull(),)
    .addColumn("modifier", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("advantage_mode", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("exploding", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("raw_rolls", "text", (col,) => col.notNull(),)
    .addColumn("raw_total", "integer", (col,) => col.notNull(),)
    .addColumn("total", "integer", (col,) => col.notNull(),)
    .addColumn("purpose", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  // ── Character Stats ────────────────────────────────────────

  await database.schema
    .createTable("character_stats",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("hp", "integer", (col,) => col.notNull(),)
    .addColumn("max_hp", "integer", (col,) => col.notNull(),)
    .addColumn("temp_hp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("mp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("max_mp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("ac", "integer", (col,) => col.notNull(),)
    .addColumn("speed", "integer", (col,) => col.notNull().defaultTo(30,),)
    .addColumn("str", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("dex", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("con", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("int", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("wis", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("cha", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("hit_dice", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("death_save_successes", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("death_save_failures", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("xp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("xp_to_next", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_character_stats_actor",)
    .on("character_stats",)
    .column("actor_id",)
    .execute();

  // ── XP Ledger ──────────────────────────────────────────────

  await database.schema
    .createTable("xp_ledger",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("amount", "integer", (col,) => col.notNull(),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("reference_id", "text",)
    .addColumn("chat_id", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_xp_ledger_actor",)
    .on("xp_ledger",)
    .column("actor_id",)
    .execute();

  // ── Loot Tables ────────────────────────────────────────────

  await database.schema
    .createTable("loot_tables",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("source_type", "text", (col,) => col.notNull(),)
    .addColumn("source_id", "text",)
    .addColumn("total_weight", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("used", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  // ── Loot Entries ───────────────────────────────────────────

  await database.schema
    .createTable("loot_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("loot_table_id", "text", (col,) => col.notNull(),)
    .addColumn("item_name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("item_type", "text", (col,) => col.notNull(),)
    .addColumn("rarity", "text", (col,) => col.notNull().defaultTo("common",),)
    .addColumn("weight", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("min_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("max_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("min_level", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_loot_entries_table",)
    .on("loot_entries",)
    .column("loot_table_id",)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("loot_entries",).execute();
  await database.schema.dropTable("loot_tables",).execute();
  await database.schema.dropTable("xp_ledger",).execute();
  await database.schema.dropTable("character_stats",).execute();
  await database.schema.dropTable("dice_roll_history",).execute();
}
