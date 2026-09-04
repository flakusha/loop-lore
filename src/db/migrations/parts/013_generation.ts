// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation — final-form schema (Generation attempts).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("generation_attempts",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("parent_message_id", "text", (col,) => col.notNull().references("messages.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("idempotency_key", "text", (col,) => col.notNull(),)
    .addColumn("model_id", "text", (col,) => col.notNull(),)
    .addColumn("provider", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("cancel_reason", "text",)
    .addColumn("cancel_reason_detail", "text",)
    .addColumn("cancel_source", "text",)
    .addColumn("abort_signal_id", "text",)
    .addColumn("started_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .addColumn("prompt_tokens", "integer",)
    .addColumn("completion_tokens", "integer",)
    .addColumn("total_tokens", "integer",)
    .addColumn("generation_time_ms", "integer",)
    .addColumn("error_message", "text",)
    .addColumn("streaming_chunks_received", "integer",)
    .addColumn("streaming_chars_received", "integer",)
    .addColumn("repetition_score", "real",)
    .addColumn("repetition_analysis", "text",)
    .addColumn("policy_analysis", "text",)
    .addColumn("response_count_in_turn", "integer",)
    .addColumn("parent_attempt_id", "text", (col,) => col.references("generation_attempts.id",),)
    .addColumn("continuation_count", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("partial_content", "text",)
    .addColumn("step_index", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("total_steps", "integer", (col,) => col.defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_rendered_chunk_index", "integer",)
    .addColumn("delivery_confirmed_at", "text",)
    .addColumn("side_effect_jobs_cancelled", "integer", (col,) => col.defaultTo(0,),)
    .execute();

  await database.schema
    .createTable("synthetic_data",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("source_data", "text", (col,) => col.notNull(),)
    .addColumn("generated_cases", "text", (col,) => col.notNull(),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("generated",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("validated_at", "text",)
    .addColumn("validated_by", "text", (col,) => col.references("actors.id",),)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_abort_signal",)
    .on("generation_attempts",)
    .column("abort_signal_id",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_actor",)
    .on("generation_attempts",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_chat",)
    .on("generation_attempts",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_created_at",)
    .on("generation_attempts",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_idempotency",)
    .on("generation_attempts",)
    .column("idempotency_key",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_parent",)
    .on("generation_attempts",)
    .column("parent_attempt_id",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_parent_msg",)
    .on("generation_attempts",)
    .column("parent_message_id",)
    .execute();

  await database.schema
    .createIndex("idx_generation_attempts_status",)
    .on("generation_attempts",)
    .column("status",)
    .execute();

  await database.schema
    .createIndex("idx_synthetic_data_chat",)
    .on("synthetic_data",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_synthetic_data_status",)
    .on("synthetic_data",)
    .column("status",)
    .execute();

  await database.schema
    .createIndex("idx_synthetic_data_type",)
    .on("synthetic_data",)
    .column("type",)
    .execute();

  await database.schema
    .createIndex("idx_synthetic_data_world",)
    .on("synthetic_data",)
    .column("world_id",)
    .execute();
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("synthetic_data",).execute();
  await database.schema.dropTable("generation_attempts",).execute();
}
