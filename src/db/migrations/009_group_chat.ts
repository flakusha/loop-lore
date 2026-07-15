import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Migration 009 — Group chat foundations
 *
 * Adds:
 * - `talkativity` on `chat_participants`: per-chat participation weight (1-10)
 * - `initiative` on `chat_participants`: per-chat initiative score for initiative strategy
 * - `parent_chat_id` on `chats`: links side-chats / notes channels to parent
 * - `chat_purpose` on `chats`: distinguishes main / side / notes channels
 * - `group_initiatives` table: scene-level initiative state for initiative turn strategy
 * - `chat_mentions` table: @mention tracking for turn-selection override
 *
 * Design decisions:
 * - talkativity is per-chat-participant, not per-actor: same actor may be talkative
 *   in one group and quiet in another
 * - initiative stored on chat_participants AND group_initiatives:前者 is the
 *   persistent config,后者 is the volatile scene-level state
 * - parent_chat_id uses SET NULL on delete: side-chat survives parent deletion
 *   (messages become orphaned but chat stays browsable)
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  // ── chat_participants: talkativity + initiative ─────────────
  await database.schema
    .alterTable("chat_participants")
    .addColumn("talkativity", "integer", (col) => col.notNull().defaultTo(5))
    .execute();

  await database.schema
    .alterTable("chat_participants")
    .addColumn("initiative", "integer", (col) => col.notNull().defaultTo(0))
    .execute();

  // ── chats: side-chat support ───────────────────────────────
  await database.schema
    .alterTable("chats")
    .addColumn("parent_chat_id", "text", (col) => col.references("chats.id").onUpdate("cascade"))
    .execute();

  await database.schema
    .alterTable("chats")
    .addColumn("chat_purpose", "text", (col) => col.notNull().defaultTo("main"))
    .execute();

  await database.schema
    .createIndex("idx_chats_parent")
    .on("chats")
    .column("parent_chat_id")
    .execute();

  // ── group_initiatives: scene-level initiative state ─────────
  await database.schema
    .createTable("group_initiatives")
    .addColumn("chat_id", "text", (col) => col.notNull().references("chats.id").onDelete("cascade"))
    .addColumn("scene_id", "text", (col) => col.notNull())
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id").onDelete("cascade"))
    .addColumn("score", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addPrimaryKeyConstraint("pk_group_initiatives", ["chat_id", "scene_id", "actor_id"])
    .execute();

  await database.schema
    .createIndex("idx_group_initiatives_chat")
    .on("group_initiatives")
    .column("chat_id")
    .execute();

  // ── chat_mentions: @mention tracking ───────────────────────
  await database.schema
    .createTable("chat_mentions")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("message_id", "text", (col) => col.notNull().references("messages.id").onDelete("cascade"))
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id").onDelete("cascade"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await database.schema
    .createIndex("idx_chat_mentions_message")
    .on("chat_mentions")
    .column("message_id")
    .execute();

  await database.schema
    .createIndex("idx_chat_mentions_actor")
    .on("chat_mentions")
    .column("actor_id")
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropIndex("idx_chat_mentions_actor").execute();
  await database.schema.dropIndex("idx_chat_mentions_message").execute();
  await database.schema.dropTable("chat_mentions").execute();

  await database.schema.dropIndex("idx_group_initiatives_chat").execute();
  await database.schema.dropTable("group_initiatives").execute();

  await database.schema.dropIndex("idx_chats_parent").execute();
  await database.schema.alterTable("chats").dropColumn("chat_purpose").execute();
  await database.schema.alterTable("chats").dropColumn("parent_chat_id").execute();

  await database.schema.alterTable("chat_participants").dropColumn("initiative").execute();
  await database.schema.alterTable("chat_participants").dropColumn("talkativity").execute();
}
