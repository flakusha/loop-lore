// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, } from "kysely";

/**
 * Migration 070 — `data_version` + `record_hash` columns on content-bearing
 * tables.
 *
 * Closes the structural half of `epic-content-hashing-distributed-integrity`:
 * every row in the six tracked tables carries:
 *
 *   - `data_version INTEGER NOT NULL DEFAULT 1` — the content-versioning
 *     registry version (matches the precedent set by `character_stats.data_version`
 *     in migration 026). Bumped by a service-layer hook when tracked columns
 *     are added; existing rows are NOT zeroed, they remain a positive integer.
 *
 *   - `record_hash TEXT NOT NULL DEFAULT ''` — the canonical row-integrity
 *     hash computed by `src/hash/record-hash.ts` over the `(table | pk |
 * canonicalJSON(hash_inputs))` envelope. Empty default keeps the column
 *     NOT NULL so callers never have to NULL-check; the row's writer fills
 *     it in the same transaction (see ticket 1 hook).
 *
 * Per-table indexes on `record_hash` make the cross-row reconciliation
 * (ticket 5) cheap without forcing a sequential scan on read.
 *
 * Tables (`assets`, `messages`, `characters`, `request_results`, `chats`,
 * `worlds`) are the six content-bearing tables named in the epic.
 * `messages` already has `format_version` (different concern — message body
 * format envelope version); `data_version` here is the tracked-column
 * projection version. They are intentionally separate.
 *
 * This migration is idempotent on `IF NOT EXISTS` style guards where the
 * Kysely builder permits (column add has no built-in guard, so the
 * apply-time probe in `down()` is the only safety). Forward-only;
 * `down()` is a best-effort reversal intended for tests, not production
 * rollback — production should pin to this migration and skip down on it.
 * @see TASK-middleware-fe-be-db-record-content-hashing.md
 * @see TASK-middleware-migration-compaction-data-version-hash.md
 * @see epic-content-hashing-distributed-integrity.md
 */

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // NOTE: the schema-type generator (scripts/generate-db-types.ts) parses
  // each .alterTable("name", ...) literally — using a variable like
  // `.alterTable(table,)` breaks it. The tables are unrolled below; do
  // NOT re-collapse to a loop without updating the generator regex.

  // ── assets ────────────────────────────────────────────
  await database.schema
    .alterTable("assets",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();
  await database.schema
    .alterTable("assets",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();
  await database.schema.createIndex("idx_assets_record_hash",).on("assets",).column("record_hash",).execute();

  // ── messages ────────────────────────────────────────────
  await database.schema
    .alterTable("messages",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();
  await database.schema
    .alterTable("messages",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();
  await database.schema.createIndex("idx_messages_record_hash",).on("messages",).column("record_hash",).execute();

  // ── characters ────────────────────────────────────────────
  await database.schema
    .alterTable("characters",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();
  await database.schema
    .alterTable("characters",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();
  await database.schema.createIndex("idx_characters_record_hash",).on("characters",).column("record_hash",).execute();

  // ── request_results ────────────────────────────────────────────
  await database.schema
    .alterTable("request_results",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();
  await database.schema
    .alterTable("request_results",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();
  await database.schema
    .createIndex("idx_request_results_record_hash",)
    .on("request_results",)
    .column("record_hash",)
    .execute();

  // ── chats ────────────────────────────────────────────
  await database.schema
    .alterTable("chats",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();
  await database.schema
    .alterTable("chats",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();
  await database.schema.createIndex("idx_chats_record_hash",).on("chats",).column("record_hash",).execute();

  // ── worlds ────────────────────────────────────────────
  await database.schema
    .alterTable("worlds",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();
  await database.schema.createIndex("idx_worlds_record_hash",).on("worlds",).column("record_hash",).execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  // Reverse order to avoid touching the index of a yet-to-be-dropped table.
  // The schema generator ignores down() blocks, so the loop form is fine here.
  const TRACKED_TABLES_REV = ["worlds", "chats", "request_results", "characters", "messages", "assets",];
  for (const table of TRACKED_TABLES_REV) {
    await database.schema.dropIndex(`idx_${table}_record_hash`,).ifExists().execute();
    await database.schema.alterTable(table,).dropColumn("record_hash",).execute();
    await database.schema.alterTable(table,).dropColumn("data_version",).execute();
  }
}
