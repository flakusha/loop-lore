// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory Embeddings — DB Schema
 *
 * Adds:
 *   memory_embeddings  — stores raw float32 vector blobs per actor_memories row
 *   memories_fts   — FTS5 virtual table on actor_memories.content for BM25
 *                    fallback + hybrid search
 */
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("memory_embeddings")
    .addColumn("memory_id", "text", (col) => col.primaryKey())
    .addColumn("model", "text", (col) => col.notNull().defaultTo("nomic-embed-text"))
    .addColumn("dimensions", "integer", (col) => col.notNull().defaultTo(1536))
    .addColumn("vector_blob", "blob", (col) => col.notNull())
    .addColumn("created_at", "integer", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_embeddings_model")
    .on("memory_embeddings")
    .column("model")
    .execute();

  await sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      memory_id UNINDEXED,
      content,
      content_rowid='memory_id'
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS memories_fts`.execute(db);
  await db.schema.dropTable("memory_embeddings").execute();
}
