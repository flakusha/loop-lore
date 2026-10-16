// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 057_column_name_disambiguation
 *
 * Renames six schema-wide identifiers that each carried two unrelated
 * meanings, plus the one additive column that came with the same change:
 *
 *   format_version -> row_version      (per-row concurrency counter)
 *   password_hash  -> secret_hash      (users; password digest)
 *   token_hash     -> secret_hash      (sessions; bearer-token digest)
 *   data_version   -> content_version  (content-staleness counter)
 *   token          -> term             (message_search_tokens; FTS term)
 *   fallback_chain -> fallback_order   (ordered list, not a chain)
 *
 * and ADDs `character_stats.record_hash` to complete that table's coverage of
 * the content-versioning pattern (034 gave it `data_version` only).
 *
 * ── Why this is a forward migration, not a rewrite ─────────────
 *
 * An earlier attempt on this branch renamed the identifiers by editing the
 * `createTable`/`addColumn` text inside the already-shipped 001_init.ts and
 * 034_content_versioning_heavy_tables.ts. That is not a schema change — it is
 * a rewrite of history, and it is invisible to every database that already
 * ran those migrations:
 *
 *   - Fresh installs got the new names, because 001_init was re-read.
 *   - Existing databases kept the old columns forever, because the files
 *     they already recorded in `kysely_migration` are unchanged on disk.
 *
 * Application code that now selects `row_version` would then fail against an
 * upgraded database with a bare "no such column", and no re-run of the
 * migration chain could fix it: the migration that carries the rename was
 * never written. `src/db/migrations/README.md` forbids the rewrite outright.
 * So 001_init and 034 are restored to their shipped bytes and the rename
 * lives here.
 *
 * ── Why RENAME COLUMN, not the create-new/copy/drop/rename dance ──
 *
 * The 022_prompt_templates_workflow_modality header explains the rebuild
 * dance as the way to change a CHECK constraint, which SQLite genuinely
 * cannot ALTER. A column rename is not in that class, and the rebuild form is
 * measurably worse here:
 *
 *   1. It is invisible to the code generators. `scripts/lib/migration-parser`
 *      drops the intermediate table a rebuild creates, so a rename written
 *      that way leaves BOTH names out of the generated schema. 022 documents
 *      the same trap ("a column first appearing on a table that is later
 *      dropped-and-renamed is discarded"). RENAME COLUMN is modelled
 *      explicitly, so the generated schema tracks it.
 *   2. It cannot express the one rename that most needs it.
 *      `message_search_tokens.token` is a member of the composite PRIMARY KEY
 *      (message_id, token). SQLite refuses `DROP COLUMN` on a PK column
 *      outright ("cannot drop PRIMARY KEY column"), so the add-new/backfill/
 *      drop-old idiom fails on it.
 *
 * `ALTER TABLE ... RENAME COLUMN` (SQLite >= 3.25; this project runs 3.53)
 * rewrites the table definition in place and carries everything with it —
 * composite PK, UNIQUE, CHECK, foreign keys, indexes, NOT NULL, DEFAULT and
 * all row data. Verified against a populated database before this migration
 * was written; the rename also updates inbound foreign keys in referencing
 * tables. One rename per `alterTable` statement, per the structure rules in
 * `src/db/migrations/README.md`.
 *
 * Every rename is a literal statement rather than a loop over a table of
 * pairs: `scripts/lib/migration-parser` reads migration source as text, so a
 * rename built from variables is invisible to codegen and silently drops the
 * column from every generated artifact. Literals are what make this
 * migration's renames reach `schema-manifest.ts` and `schema.ts`.
 *
 * ── Index names ────────────────────────────────────────────────
 *
 * The index covering the renamed `sessions` column is recreated under a
 * matching name, so the index name keeps tracking the column it covers.
 * Renaming the column alone would leave `idx_sessions_token_hash` pointing at
 * `secret_hash`, which is exactly the ambiguity this migration removes. The
 * `message_search_tokens` index keeps its existing name; SQLite's rename
 * already re-points its columns. Neither index name is referenced from
 * application code.
 */
import { type Kysely, } from "kysely";

/**
 * @param db
 * @returns {Promise<void>}
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  // ── Concurrency counters: format_version -> row_version ──
  await db.schema.alterTable("users",).renameColumn("format_version", "row_version",).execute();
  await db.schema.alterTable("actors",).renameColumn("format_version", "row_version",).execute();
  await db.schema.alterTable("messages",).renameColumn("format_version", "row_version",).execute();
  await db.schema.alterTable("personas",).renameColumn("format_version", "row_version",).execute();

  // ── Credential digests: -> secret_hash ──
  await db.schema.alterTable("users",).renameColumn("password_hash", "secret_hash",).execute();
  await db.schema.alterTable("sessions",).renameColumn("token_hash", "secret_hash",).execute();

  // ── Content staleness: data_version -> content_version ──
  await db.schema
    .alterTable("request_results",)
    .renameColumn("data_version", "content_version",)
    .execute();

  await db.schema.alterTable("assets",).renameColumn("data_version", "content_version",).execute();
  await db.schema.alterTable("worlds",).renameColumn("data_version", "content_version",).execute();
  await db.schema.alterTable("characters",).renameColumn("data_version", "content_version",).execute();
  await db.schema.alterTable("character_stats",).renameColumn("data_version", "content_version",).execute();
  await db.schema.alterTable("chats",).renameColumn("data_version", "content_version",).execute();
  await db.schema.alterTable("messages",).renameColumn("data_version", "content_version",).execute();
  await db.schema.alterTable("items",).renameColumn("data_version", "content_version",).execute();
  await db.schema
    .alterTable("world_lore_entries",)
    .renameColumn("data_version", "content_version",)
    .execute();

  await db.schema
    .alterTable("actor_lore_entries",)
    .renameColumn("data_version", "content_version",)
    .execute();

  await db.schema.alterTable("quests",).renameColumn("data_version", "content_version",).execute();
  await db.schema.alterTable("locations",).renameColumn("data_version", "content_version",).execute();
  await db.schema.alterTable("blog_posts",).renameColumn("data_version", "content_version",).execute();
  await db.schema.alterTable("shadow_notes",).renameColumn("data_version", "content_version",).execute();
  await db.schema.alterTable("whitenotes",).renameColumn("data_version", "content_version",).execute();
  await db.schema.alterTable("crafting_recipes",).renameColumn("data_version", "content_version",).execute();

  // ── The two names that were plain wrong ──
  // PK member: only RENAME COLUMN can move this one.
  await db.schema.alterTable("message_search_tokens",).renameColumn("token", "term",).execute();
  await db.schema
    .alterTable("character_avatar_config",)
    .renameColumn("fallback_chain", "fallback_order",)
    .execute();

  // character_stats carried `data_version` (034) but never `record_hash`, so
  // the content-versioning pair was incomplete for that table. Additive, with
  // the same defaults 034 uses: existing rows land at '' and every consumer
  // already treats an empty digest as "not yet hashed".
  await db.schema
    .alterTable("character_stats",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  // Keep the index name tracking the column it covers.
  await db.schema.dropIndex("idx_sessions_token_hash",).execute();
  await db.schema.createIndex("idx_sessions_secret_hash",).on("sessions",).column("secret_hash",).execute();
}

/**
 * @param db
 * @returns {Promise<void>}
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  // Drop the index BEFORE renaming the column back. RENAME COLUMN re-points
  // the existing index at the new name, so leaving it in place makes SQLite
  // reject the rollback ("error in index after drop column: no such column").
  await db.schema.dropIndex("idx_sessions_secret_hash",).execute();

  await db.schema.alterTable("character_stats",).dropColumn("record_hash",).execute();

  await db.schema
    .alterTable("character_avatar_config",)
    .renameColumn("fallback_order", "fallback_chain",)
    .execute();

  await db.schema.alterTable("message_search_tokens",).renameColumn("term", "token",).execute();

  await db.schema.alterTable("crafting_recipes",).renameColumn("content_version", "data_version",).execute();
  await db.schema.alterTable("whitenotes",).renameColumn("content_version", "data_version",).execute();
  await db.schema.alterTable("shadow_notes",).renameColumn("content_version", "data_version",).execute();
  await db.schema.alterTable("blog_posts",).renameColumn("content_version", "data_version",).execute();
  await db.schema.alterTable("locations",).renameColumn("content_version", "data_version",).execute();
  await db.schema.alterTable("quests",).renameColumn("content_version", "data_version",).execute();
  await db.schema
    .alterTable("actor_lore_entries",)
    .renameColumn("content_version", "data_version",)
    .execute();

  await db.schema
    .alterTable("world_lore_entries",)
    .renameColumn("content_version", "data_version",)
    .execute();

  await db.schema.alterTable("items",).renameColumn("content_version", "data_version",).execute();
  await db.schema.alterTable("messages",).renameColumn("content_version", "data_version",).execute();
  await db.schema.alterTable("chats",).renameColumn("content_version", "data_version",).execute();
  await db.schema.alterTable("character_stats",).renameColumn("content_version", "data_version",).execute();
  await db.schema.alterTable("characters",).renameColumn("content_version", "data_version",).execute();
  await db.schema.alterTable("worlds",).renameColumn("content_version", "data_version",).execute();
  await db.schema.alterTable("assets",).renameColumn("content_version", "data_version",).execute();
  await db.schema
    .alterTable("request_results",)
    .renameColumn("content_version", "data_version",)
    .execute();

  await db.schema.alterTable("sessions",).renameColumn("secret_hash", "token_hash",).execute();
  await db.schema.alterTable("users",).renameColumn("secret_hash", "password_hash",).execute();

  await db.schema.alterTable("personas",).renameColumn("row_version", "format_version",).execute();
  await db.schema.alterTable("messages",).renameColumn("row_version", "format_version",).execute();
  await db.schema.alterTable("actors",).renameColumn("row_version", "format_version",).execute();
  await db.schema.alterTable("users",).renameColumn("row_version", "format_version",).execute();

  await db.schema.createIndex("idx_sessions_token_hash",).on("sessions",).column("token_hash",).execute();
}
