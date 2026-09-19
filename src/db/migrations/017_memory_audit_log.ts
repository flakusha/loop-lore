// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory audit log (FEAT-075).
 *
 * `memory_audit_log` records lifecycle events for `actor_memories` so users
 * can trace what happened to a memory: who created/pinned/modified it, when
 * it was decayed or purged, and which memories were injected into prompts.
 *
 * Append-only. No FK to `actor_memories` (audit survives memory deletion).
 * No FK to `users` (system actions like decay run with user_id NULL).
 *
 * Top-level (not a `001_init` part): `001_init.ts` is frozen. New top-level
 * migrations are auto-discovered by `getMigrationFiles()` (sorted by name).
 */
import { type Kysely, sql, } from "kysely";
import { recordSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("memory_audit_log",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("memory_id", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text",)
    .addColumn("action", "text", (col,) => col.notNull(),)
    .addColumn("details", "text", (col,) => col.notNull().defaultTo(sql`('{}')`,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_memory_audit_log_memory",)
    .on("memory_audit_log",)
    .columns(["memory_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_memory_audit_log_actor",)
    .on("memory_audit_log",)
    .columns(["actor_id", "created_at",],)
    .execute();

  await recordSchemaVersion(database, 38, "memory audit log (FEAT-075)",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("memory_audit_log",).execute();
}
