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
import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("data_version", "integer", (col) => col.notNull().defaultTo(1))
    .execute();

  await db.schema
    .alterTable("personas")
    .addColumn("data_version", "integer", (col) => col.notNull().defaultTo(1))
    .execute();

  await db.schema
    .alterTable("messages")
    .addColumn("data_version", "integer", (col) => col.notNull().defaultTo(1))
    .execute();

  await db.schema
    .createTable("data_migrations")
    .addColumn("table_name", "text", (col) => col.notNull())
    .addColumn("from_version", "integer", (col) => col.notNull())
    .addColumn("to_version", "integer", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("applied_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addPrimaryKeyConstraint("pk_data_migrations", ["table_name", "to_version"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("data_migrations").execute();
  await db.schema.alterTable("messages").dropColumn("data_version").execute();
  await db.schema.alterTable("personas").dropColumn("data_version").execute();
  await db.schema.alterTable("users").dropColumn("data_version").execute();
}