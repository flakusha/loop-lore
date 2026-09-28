// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 024_memory_embeddings_cascade_fk
 *
 * `memory_embeddings` was created without a foreign key, so deleting an
 * `actor_memories` row left its vector row behind. Nothing in the product path
 * called `deleteEmbedding()` (only its unit test did), so every deleted memory
 * leaked a 1536-dim blob.
 *
 * Fixing this at the call sites would mean touching each of the three delete
 * paths, and two of them delete by `source_chat_id` rather than `memory_id`
 * (`src/chat/service/crud/delete.ts:44`, `src/chat/service/batch.ts:74`), so a
 * per-memory call would miss every chat-deleted memory. A single FK with
 * ON DELETE CASCADE covers all three by construction.
 *
 * The column is the primary key, so the FK is one-to-one and needs no index of
 * its own — the parent key is already unique.
 *
 * SQLite cannot add a constraint to an existing table, so this rebuilds
 * `memory_embeddings` with the same columns plus the FK. Rows whose
 * `memory_id` no longer exists in `actor_memories` are already orphans; they
 * are dropped rather than carried over, which is the point of the fix.
 *
 * FKs are only enforced when a connection sets `PRAGMA foreign_keys = ON`;
 * the migration chain is covered by `src/db/migrations.test.ts` and
 * `migration-roundtrip.test.ts`.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // No `PRAGMA foreign_keys = OFF` around this: SQLite ignores that pragma
  // inside a transaction, which is where the Migrator runs every migration, so
  // the toggle would be a silent no-op. The rebuild does not need one -- the
  // table is dropped and recreated in one shot, so no row is ever inserted
  // while the old constraint is still live.
  await database.schema
    .dropTable("memory_embeddings",)
    .execute();

  await database.schema
    .createTable("memory_embeddings",)
    .addColumn("memory_id", "text", (col,) => col.primaryKey().references("actor_memories.id",).onDelete("cascade",),)
    .addColumn("model", "text", (col,) => col.notNull().defaultTo("nomic-embed-text",),)
    .addColumn("dimensions", "integer", (col,) => col.notNull().defaultTo(1536,),)
    .addColumn("vector_blob", "blob", (col,) => col.notNull(),)
    .addColumn("created_at", "integer", (col,) => col.notNull(),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // Same no-op-pragma reasoning as up().
  await database.schema
    .dropTable("memory_embeddings",)
    .execute();

  // Back to the pre-024 shape: same columns, no FK, so orphans are permitted.
  await database.schema
    .createTable("memory_embeddings",)
    .addColumn("memory_id", "text", (col,) => col.primaryKey(),)
    .addColumn("model", "text", (col,) => col.notNull().defaultTo("nomic-embed-text",),)
    .addColumn("dimensions", "integer", (col,) => col.notNull().defaultTo(1536,),)
    .addColumn("vector_blob", "blob", (col,) => col.notNull(),)
    .addColumn("created_at", "integer", (col,) => col.notNull(),)
    .execute();
}
