import type { Kysely, } from "kysely";

/**
 * Migration 027 — GM Config & Visual Novel
 *
 * Adds `visual_novel` column to chats table.
 * `gm_config` already exists as text — the typed schema (`GmConfig`)
 * is enforced at the application layer, not the DB layer.
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .addColumn("visual_novel", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .dropColumn("visual_novel",)
    .execute();
}
