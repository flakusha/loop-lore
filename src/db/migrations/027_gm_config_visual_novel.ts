import type { Kysely, } from "kysely";

/**
 * Migration 027 — GM Config & Visual Novel
 *
 * Adds `visual_novel` column to chats table.
 * `gm_config` already exists as text — the typed schema (`GmConfig`)
 * is enforced at the application layer, not the DB layer.
 *
 * Guarded: column may already exist from migration 012.
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  try {
    await database.schema
      .alterTable("chats",)
      .addColumn("visual_novel", "integer", (col,) => col.notNull().defaultTo(0,),)
      .execute();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e,);
    if (!msg.includes("duplicate column",)) { throw e; }
  }
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  try {
    await database.schema
      .alterTable("chats",)
      .dropColumn("visual_novel",)
      .execute();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e,);
    if (!msg.includes("no such column",)) { throw e; }
  }
}
