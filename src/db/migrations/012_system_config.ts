import { type Kysely, sql, } from "kysely";
import { type Kysely, sql, } from "kysely";

/**
 * Migration 012 — System config key-value table
 *
 * Stores runtime configuration overrides from admin panel.
 * Seeded at startup from config.yaml defaults.
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("system_config",)
    .addColumn("key", "text", (col,) => col.primaryKey(),)
    .addColumn("value", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("system_config",).execute();
}
