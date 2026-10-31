// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 089_resource_provision
 *
 * Foundation tables for epic-resource-provision: provisioned external
 * resources (`resource_records`), opt-in browser-backup blobs
 * (`backup_records`), and per-minute routing-guard counters
 * (`resource_quota_counters`).
 *
 * `credential_ref` holds a one-way reference (SHA-256 hex or a wrapped-key
 * envelope from src/crypto/byok.ts) — never the raw secret. `quota` is a
 * JSON ResourceQuota envelope (`{"requestsPerMinute":..,"tokensPerMinute":..}`).
 */
import { type Kysely, sql, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("resource_records",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("provider", "text", (col,) => col.notNull(),)
    .addColumn("endpoint", "text", (col,) => col.notNull(),)
    .addColumn("credential_ref", "text", (col,) => col.notNull(),)
    .addColumn("quota", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_used_at", "text",)
    .execute();

  await db.schema
    .createIndex("idx_resource_records_owner",)
    .on("resource_records",)
    .columns(["owner_id",],)
    .execute();

  await db.schema
    .createTable("backup_records",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("resource_type", "text", (col,) => col.notNull(),)
    .addColumn("owner_id", "text", (col,) => col.notNull(),)
    .addColumn("content_hash", "text", (col,) => col.notNull(),)
    .addColumn("server_hash", "text",)
    .addColumn("payload", "text", (col,) => col.notNull(),)
    .addColumn("version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("storage_quota_bytes", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await db.schema
    .createIndex("idx_backup_records_owner",)
    .on("backup_records",)
    .columns(["owner_id", "resource_type",],)
    .execute();

  await db.schema
    .createTable("resource_quota_counters",)
    .addColumn("resource_id", "text", (col,) => col.primaryKey(),)
    .addColumn("window_start", "text", (col,) => col.notNull(),)
    .addColumn("requests", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("tokens", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  // SQLite DROP INDEX takes no ON clause (Kysely's `.on()` emits MySQL syntax).
  await db.schema.dropIndex("idx_backup_records_owner",).execute();
  await db.schema.dropIndex("idx_resource_records_owner",).execute();
  await db.schema.dropTable("resource_quota_counters",).execute();
  await db.schema.dropTable("backup_records",).execute();
  await db.schema.dropTable("resource_records",).execute();
}
