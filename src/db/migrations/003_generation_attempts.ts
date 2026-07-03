import type { Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // ── Generation Attempts ─────────────────────────────────────
  // Tracks LLM generation attempts for idempotency, cancellation, retry, and analytics
  await database.schema
    .createTable("generation_attempts")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("chat_id", "text", (col) => col.notNull().references("chats.id"))
    .addColumn("parent_message_id", "text", (col) => col.notNull().references("messages.id"))
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id"))
    .addColumn("idempotency_key", "text", (col) => col.notNull())
    .addColumn("model_id", "text", (col) => col.notNull())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending")) // 'pending' | 'processing' | 'streaming' | 'completed' | 'failed' | 'cancelled'
    .addColumn("cancel_reason", "text") // 'user_cancel' | 'repetition_detected' | 'policy_mismatch' | 'response_limit' | 'chat_switch'
    .addColumn("cancel_reason_detail", "text")
    .addColumn("cancel_source", "text") // 'user' | 'auto_repetition' | 'auto_policy' | 'auto_limit' | 'chat_switch'
    .addColumn("abort_signal_id", "text")
    .addColumn("started_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("completed_at", "text")
    .addColumn("prompt_tokens", "integer")
    .addColumn("completion_tokens", "integer")
    .addColumn("total_tokens", "integer")
    .addColumn("generation_time_ms", "integer")
    .addColumn("error_message", "text")
    .addColumn("streaming_chunks_received", "integer")
    .addColumn("streaming_chars_received", "integer")
    .addColumn("repetition_score", "real") // 0-1 score for repetition detection
    .addColumn("repetition_analysis", "text") // JSON with repetition details
    .addColumn("policy_analysis", "text") // JSON with policy analysis details
    .addColumn("response_count_in_turn", "integer")
    .addColumn("parent_attempt_id", "text") // FK → generation_attempts.id — for continuation chains
    .addColumn("continuation_count", "integer") // which continuation number (1-based)
    .addColumn("partial_content", "text") // captured partial content for Continue feature
    .addColumn("step_index", "integer", (col) => col.defaultTo(0)) // current step in multi-step pipeline
    .addColumn("total_steps", "integer", (col) => col.defaultTo(1)) // total steps in multi-step pipeline
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_generation_attempts_chat").on("generation_attempts").column("chat_id").execute();
  await database.schema.createIndex("idx_generation_attempts_parent_msg").on("generation_attempts").column("parent_message_id").execute();
  await database.schema.createIndex("idx_generation_attempts_actor").on("generation_attempts").column("actor_id").execute();
  await database.schema.createIndex("idx_generation_attempts_idempotency").on("generation_attempts").column("idempotency_key").execute();
  await database.schema.createIndex("idx_generation_attempts_status").on("generation_attempts").column("status").execute();
  await database.schema.createIndex("idx_generation_attempts_abort_signal").on("generation_attempts").column("abort_signal_id").execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("generation_attempts").execute();
}