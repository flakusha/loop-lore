// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 090_model_rankings
 *
 * Append-only history for model measurements: fit verdicts (llmfit),
 * board quality scores, and local experience grades. Append-only is the
 * whole point — `model_capabilities` overwrites in place on rescan, so
 * it cannot answer "what did we measure last Tuesday"; a new
 * measurement here is a new row.
 *
 * `scope` is the trust split: 'global' (a board's opinion), 'instance'
 * (this box), 'hardware' (a hardware class). `basis` is the trust
 * label: 'measured' (benched here, never expires), 'community',
 * 'imported' (row date + 180 d), 'formula' (estimate, 7 d or until the
 * hardware fingerprint changes). UGI-style sources and global vs
 * per-instance are scopes/sources, not separate tables.
 *
 * `ranking_snapshots` is the anti-re-fetch mechanism: one row per
 * fetch, so a snapshot whose `next_refresh_after` is in the future
 * means "read payload, skip the network". No FKs by design — ranking
 * rows must survive provider/user/model churn (066 precedent).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("model_rankings",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addColumn("scope_key", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("subject_key", "text", (col,) => col.notNull(),)
    .addColumn("metric", "text", (col,) => col.notNull(),)
    .addColumn("value", "real", (col,) => col.notNull(),)
    .addColumn("unit", "text",)
    .addColumn("basis", "text", (col,) => col.notNull(),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("source_version", "text",)
    .addColumn("source_ref", "text",)
    .addColumn("observed_at", "text", (col,) => col.notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("meta", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("uq_model_rankings_ingest",)
    .on("model_rankings",)
    .columns(["scope", "scope_key", "subject_key", "metric", "source", "observed_at",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_model_rankings_latest",)
    .on("model_rankings",)
    .columns(["scope", "scope_key", "subject_key", "metric", "observed_at",],)
    .execute();

  await database.schema
    .createIndex("idx_model_rankings_expires",)
    .on("model_rankings",)
    .columns(["expires_at",],)
    .execute();

  await database.schema
    .createTable("ranking_snapshots",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("source_key", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("version", "text", (col,) => col.notNull(),)
    .addColumn("checksum", "text",)
    .addColumn("fetched_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("next_refresh_after", "text", (col,) => col.notNull(),)
    .addColumn("row_count", "integer",)
    .addColumn("payload", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("ok",),)
    .addColumn("last_error", "text",)
    .addColumn("meta", "text", (col,) => col.notNull().defaultTo("{}",),)
    .execute();

  await database.schema
    .createIndex("uq_ranking_snapshots_version",)
    .on("ranking_snapshots",)
    .columns(["source", "source_key", "version",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_ranking_snapshots_refresh",)
    .on("ranking_snapshots",)
    .columns(["source", "source_key", "next_refresh_after",],)
    .execute();

  await database.schema
    .createIndex("idx_messages_model_id",)
    .on("messages",)
    .columns(["model_id",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // SQLite DROP INDEX takes no ON clause (Kysely's `.on()` emits MySQL syntax).
  await database.schema.dropIndex("idx_messages_model_id",).execute();
  await database.schema.dropIndex("idx_ranking_snapshots_refresh",).execute();
  await database.schema.dropIndex("uq_ranking_snapshots_version",).execute();
  await database.schema.dropTable("ranking_snapshots",).execute();
  await database.schema.dropIndex("idx_model_rankings_expires",).execute();
  await database.schema.dropIndex("idx_model_rankings_latest",).execute();
  await database.schema.dropIndex("uq_model_rankings_ingest",).execute();
  await database.schema.dropTable("model_rankings",).execute();
}
