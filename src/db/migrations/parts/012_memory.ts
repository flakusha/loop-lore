// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory — final-form schema (Actor memories + embeddings).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("actor_memories",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("source_chat_id", "text", (col,) => col.references("chats.id",),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("memory_type", "text", (col,) => col.notNull().defaultTo("fact",),)
    .addColumn("confidence", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("importance", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("keywords", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .addColumn("decay_rate", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("strength", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("last_accessed_at", "text",)
    .addColumn("source_message_id", "text",)
    .addColumn("context", "text",)
    .addColumn("world_id", "text",)
    .addColumn("user_id", "text",)
    .addColumn("scope", "text", (col,) => col.notNull().defaultTo("character",),)
    .addColumn("pinned", "text", (col,) => col.notNull().defaultTo("unpinned",),)
    .addColumn("privacy", "text", (col,) => col.notNull().defaultTo("shared",),)
    .addColumn("shareability", "text",)
    .execute();

  await database.schema
    .createTable("memory_embeddings",)
    .addColumn("memory_id", "text", (col,) => col.primaryKey(),)
    .addColumn("model", "text", (col,) => col.notNull().defaultTo("nomic-embed-text",),)
    .addColumn("dimensions", "integer", (col,) => col.notNull().defaultTo(1536,),)
    .addColumn("vector_blob", "blob", (col,) => col.notNull(),)
    .addColumn("created_at", "integer", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_actor",)
    .on("actor_memories",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_created_at",)
    .on("actor_memories",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_last_accessed",)
    .on("actor_memories",)
    .column("last_accessed_at",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_source_chat",)
    .on("actor_memories",)
    .column("source_chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_type",)
    .on("actor_memories",)
    .column("memory_type",)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_user_scope",)
    .on("actor_memories",)
    .columns(["user_id", "scope",],)
    .execute();

  await database.schema
    .createIndex("idx_actor_memories_world_actor",)
    .on("actor_memories",)
    .columns(["world_id", "actor_id",],)
    .execute();

  await database.schema
    .createIndex("idx_embeddings_model",)
    .on("memory_embeddings",)
    .column("model",)
    .execute();
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("memory_embeddings",).execute();
  await database.schema.dropTable("actor_memories",).execute();
}
