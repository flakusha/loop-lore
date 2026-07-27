import type { Kysely, } from "kysely";

/**
 * Migration 028 — Character Storage Format Support
 *
 * Adds columns to the actors table to support YAML and TOML
 * as first-class storage formats alongside JSON.
 *
 * - data_source_format: tracks the original format of character data
 * - data_raw: stores the raw YAML/TOML source for export fidelity
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Add storage format columns to actors ────────────
  await database.schema
    .alterTable("actors",)
    .addColumn("data_source_format", "text", (col,) => col.defaultTo("json",),)
    .addColumn("data_raw", "text", (col,) => col,)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actors",)
    .dropColumn("data_raw",)
    .dropColumn("data_source_format",)
    .execute();
}
