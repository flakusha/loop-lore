/**
 * Migration 018 — Data version columns + tracking table
 *
 * Adds `data_version` to tables that carry user-facing structured data:
 * - `users.data_version`: tracks settings JSON format version
 * - `personas.data_version`: tracks persona fields format version
 * - `messages.data_version`: tracks content/encoding format version
 *
 * Creates `data_migrations` table for tracking data migration scripts.
 *
 * `actors.data_version` already exists from 001_init.
 *
 * Default 1 = current format. Data migration scripts bump old rows
 * to newer versions when format actually changes.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("users",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();

  await database.schema
    .alterTable("personas",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();

  await database.schema
    .alterTable("messages",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
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

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("data_migrations",).execute();
  await database.schema.alterTable("messages",).dropColumn("data_version",).execute();
  await database.schema.alterTable("personas",).dropColumn("data_version",).execute();
  await database.schema.alterTable("users",).dropColumn("data_version",).execute();
}
