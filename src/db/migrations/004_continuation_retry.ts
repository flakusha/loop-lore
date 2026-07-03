import type { Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // ── Continuation & Retry-from-point columns ─────────────────
  // Links a generation attempt to its parent (for continuation chains)
  await database.schema
    .alterTable("generation_attempts")
    .addColumn("parent_attempt_id", "text", (col) =>
      col.references("generation_attempts.id").defaultTo(null),
    )
    .execute();

  // Tracks how many continuations have been made from this attempt
  await database.schema
    .alterTable("generation_attempts")
    .addColumn("continuation_count", "integer", (col) => col.defaultTo(0))
    .execute();

  // Stores partial content captured at cancellation/failure time (for Continue)
  await database.schema
    .alterTable("generation_attempts")
    .addColumn("partial_content", "text")
    .execute();

  // Multi-step pipeline tracking
  await database.schema
    .alterTable("generation_attempts")
    .addColumn("step_index", "integer", (col) => col.defaultTo(0))
    .execute();

  await database.schema
    .alterTable("generation_attempts")
    .addColumn("total_steps", "integer", (col) => col.defaultTo(1))
    .execute();

  // ── Index for continuation lookups ─────────────────────────
  await database.schema
    .createIndex("idx_generation_attempts_parent")
    .on("generation_attempts")
    .column("parent_attempt_id")
    .execute();

  // ── Messages: parent_id for tree model ─────────────────────
  // Links a message to its parent in the message tree
  await database.schema
    .alterTable("messages")
    .addColumn("parent_id", "text", (col) =>
      col.references("messages.id").defaultTo(null),
    )
    .execute();

  await database.schema
    .createIndex("idx_messages_parent")
    .on("messages")
    .column("parent_id")
    .execute();

  // ── Messages: continuation metadata ────────────────────────
  await database.schema
    .alterTable("messages")
    .addColumn("is_continuation", "integer", (col) =>
      col.notNull().defaultTo(0),
    )
    .execute();

  await database.schema
    .alterTable("messages")
    .addColumn("continuation_index", "integer")
    .execute();

  // Marks a message as having partial/cut-off content
  await database.schema
    .alterTable("messages")
    .addColumn("partial", "integer", (col) => col.notNull().defaultTo(0))
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .alterTable("generation_attempts")
    .dropColumn("parent_attempt_id")
    .execute();

  await database.schema
    .alterTable("generation_attempts")
    .dropColumn("continuation_count")
    .execute();

  await database.schema
    .alterTable("generation_attempts")
    .dropColumn("partial_content")
    .execute();

  await database.schema
    .alterTable("generation_attempts")
    .dropColumn("step_index")
    .execute();

  await database.schema
    .alterTable("generation_attempts")
    .dropColumn("total_steps")
    .execute();

  await database.schema
    .alterTable("messages")
    .dropColumn("parent_id")
    .execute();

  await database.schema
    .alterTable("messages")
    .dropColumn("is_continuation")
    .execute();

  await database.schema
    .alterTable("messages")
    .dropColumn("continuation_index")
    .execute();

  await database.schema
    .alterTable("messages")
    .dropColumn("partial")
    .execute();
}
