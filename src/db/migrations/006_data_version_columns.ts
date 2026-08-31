/**
 * Migration 006 — Format version columns + data migration tracking
 *
 * Adds `format_version` to tables that carry user-facing structured data:
 * - `users.format_version`: tracks settings JSON format version
 * - `personas.format_version`: tracks persona fields format version
 * - `messages.format_version`: tracks content/encoding format version
 *
 * Creates `data_migrations` table for tracking data migration scripts.
 *
 * `actors.format_version` already exists from 001_init.
 *
 * Default 0 = initial format. Data migration scripts bump old rows
 * to newer versions when format actually changes.
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("personas",)
    .addColumn("format_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("messages",)
    .addColumn("format_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .createTable("data_migrations",)
    .addColumn("table_name", "text", (col,) => col.notNull(),)
    .addColumn("from_version", "integer", (col,) => col.notNull(),)
    .addColumn("to_version", "integer", (col,) => col.notNull(),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("applied_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addPrimaryKeyConstraint("pk_data_migrations", ["table_name", "to_version",],)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("data_migrations",).execute();
  await database.schema.alterTable("messages",).dropColumn("format_version",).execute();
  await database.schema.alterTable("personas",).dropColumn("format_version",).execute();
}
