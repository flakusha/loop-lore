/**
 * Migration 035 — Create message_translations table
 *
 * This table was added to the schema (schema-core.ts) but no migration
 * was created at the time. Migration 034 depends on it existing for
 * index creation.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<any>,): Promise<void> {
  const hasTable = await sql<{ tbl: number }>`SELECT 1 as tbl FROM sqlite_master WHERE type = 'table' AND name = 'message_translations'`.execute(database,);

  if (!hasTable.rows[0]?.exists) {
    await database.schema
      .createTable("message_translations",)
      .addColumn("id", "text", (col,) => col.primaryKey(),)
      .addColumn("message_id", "text", (col,) => col.notNull()
        .references("messages.id").onDelete("cascade",),)
      .addColumn("locale", "text", (col,) => col.notNull(),)
      .addColumn("content", "text", (col,) => col.notNull(),)
      .addColumn("provider", "text",)
      .addColumn("created_at", "text", (col,) => col.notNull(),)
      .addColumn("updated_at", "text",)
      .execute();
  }
}

export async function down(database: Kysely<any>,): Promise<void> {
  await database.schema.dropTable("message_translations",).execute();
}
