import type { Kysely, } from "kysely";

/**
 * Migration 027 — LLM/SD Template Injection
 *
 * Adds:
 * - template_overrides column to actors table (per-character prompt template overrides)
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Add template_overrides to actors ──────────────────────
  await database.schema
    .alterTable("actors",)
    .addColumn("template_overrides", "text", (col,) => col.notNull().defaultTo("{}",),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actors",)
    .dropColumn("template_overrides",)
    .execute();
}
