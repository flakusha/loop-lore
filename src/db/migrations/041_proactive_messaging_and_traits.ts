/**
 * Proactive Messaging & Character Internal Traits — DB Schema
 *
 * Two new tables:
 *
 * 1. `proactive_messaging_config` — per-chat config controlling when the
 *    assistant proactively sends messages (frequency, quiet hours, anti-spam
 *    backoff). See .plan/tickets/TASK-proactive-messaging.md.
 *
 * 2. `character_internal_traits` — aspirations, moral disposition, autonomy
 *    preferences, coping mechanisms, approach tendencies, and voice patterns
 *    for characters. See .plan/epics/epic-character-internal-traits.md.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  // ── Proactive Messaging Config ────────────────────────────
  await db.schema
    .createTable("proactive_messaging_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",).notNull(),)
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",).onDelete("cascade",).notNull(),)
    // Frequency: very_frequent (~1hr), frequent (~3hr), normal (~1/day), infrequent (~4 days)
    .addColumn("frequency", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("quiet_hours_start", "text",) // HH:mm format, e.g. "22:00"
    .addColumn("quiet_hours_end", "text",) // HH:mm format, e.g. "08:00"
    .addColumn("enabled", "integer", (col,) => col.notNull().defaultTo(1,),) // boolean: 1=enabled
    .addColumn("last_proactive_at", "text",) // ISO timestamp of last proactive message
    .addColumn("backoff_count", "integer", (col,) => col.notNull().defaultTo(0,),) // exponential backoff counter
    .addColumn("config_json", "text", (col,) => col.notNull().defaultTo("{}",),) // extra config (context rules, etc.)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .execute();

  await db.schema
    .createIndex("idx_proactive_messaging_chat",)
    .on("proactive_messaging_config",)
    .column("chat_id",)
    .execute();

  await db.schema
    .createIndex("idx_proactive_messaging_actor",)
    .on("proactive_messaging_config",)
    .column("actor_id",)
    .execute();

  await db.schema
    .createIndex("idx_proactive_messaging_chat_actor",)
    .on("proactive_messaging_config",)
    .columns(["chat_id", "actor_id",],)
    .execute();

  // ── Character Internal Traits ─────────────────────────────
  await db.schema
    .createTable("character_internal_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",).onDelete("cascade",).notNull(),)
    // Aspirations: goals the character is pursuing (JSON array)
    .addColumn("aspirations", "text", (col,) => col.notNull().defaultTo("[]",),)
    // Moral disposition: two-axis { lawful_chaotic: -100..100, good_evil: -100..100 }
    .addColumn("moral_disposition", "text", (col,) => col.notNull().defaultTo("{}",),)
    // Autonomy preferences: { group_comfort: 0..100, solo_comfort: 0..100, separation_triggers, reunion_triggers }
    .addColumn("autonomy_preferences", "text", (col,) => col.notNull().defaultTo("{}",),)
    // Coping mechanisms: { stress_response, failure_response, conflict_style }
    .addColumn("coping_mechanisms", "text", (col,) => col.notNull().defaultTo("{}",),)
    // Approach tendencies: { decision_style, risk_tolerance, initiative_level }
    .addColumn("approach_tendencies", "text", (col,) => col.notNull().defaultTo("{}",),)
    // Voice patterns: { verbal_tics, vocabulary_level, sentence_structure, humor_style, emotional_range }
    .addColumn("voice_patterns", "text", (col,) => col.notNull().defaultTo("{}",),)
    // Visibility: which fields the character is open about (JSON array of field names)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .execute();

  await db.schema
    .createIndex("idx_character_internal_traits_actor",)
    .on("character_internal_traits",)
    .column("actor_id",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropTable("character_internal_traits",).execute();
  await db.schema.dropTable("proactive_messaging_config",).execute();
}
