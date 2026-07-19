import { type Kysely, sql, } from "kysely";
import { type Kysely, sql, } from "kysely";

/**
 * Migration 014 — Plugin state persistence
 *
 * Tracks plugin enable/disable state at runtime.
 * Registry checks this table before dispatching routes or allowing hooks.
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("plugin_state",)
    .addColumn("name", "text", (col,) => col.primaryKey(),)
    .addColumn("enabled", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("enabled_at", "text",)
    .addColumn("disabled_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("plugin_state",).execute();
}
