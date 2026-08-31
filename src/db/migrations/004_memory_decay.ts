import type { Kysely, } from "kysely";

/**
 * Migration 011 — Memory decay and strength tracking
 *
 * Adds:
 * - `decay_rate` on `actor_memories`: float (0 = never decays, higher = faster fade)
 * - `strength` on `actor_memories`: float (1.0 = full encoding, decays per access pattern)
 * - `last_accessed_at` on `actor_memories`: tracks when memory was last retrieved for decay calc
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actor_memories",)
    .addColumn("decay_rate", "real", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("strength", "real", (col,) => col.notNull().defaultTo(1,),)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("last_accessed_at", "text",)
    .execute();

  // ── Chat promotion tracking (FEAT-072) ──────────────────────
  await database.schema
    .alterTable("actor_memories",)
    .addColumn("source_message_id", "text",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("context", "text",)
    .execute();
  // ── Memory scope and visibility (three-tier system) ────────
  await database.schema
    .alterTable("actor_memories",)
    .addColumn("world_id", "text",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("user_id", "text",)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("scope", "text", (col,) => col.notNull().defaultTo("character",),)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("pinned", "text", (col,) => col.notNull().defaultTo("unpinned",),)
    .execute();
  // ── Memory privacy and shareability ───────────────────────
  await database.schema
    .alterTable("actor_memories",)
    .addColumn("privacy", "text", (col,) => col.notNull().defaultTo("shared",),)
    .execute();

  await database.schema
    .alterTable("actor_memories",)
    .addColumn("shareability", "text",)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("actor_memories",).dropColumn("shareability",).execute();
  await database.schema.alterTable("actor_memories",).dropColumn("privacy",).execute();
  await database.schema.alterTable("actor_memories",).dropColumn("pinned",).execute();
  await database.schema.alterTable("actor_memories",).dropColumn("scope",).execute();
  await database.schema.alterTable("actor_memories",).dropColumn("user_id",).execute();
  await database.schema.alterTable("actor_memories",).dropColumn("world_id",).execute();
  await database.schema.alterTable("actor_memories",).dropColumn("context",).execute();
  await database.schema.alterTable("actor_memories",).dropColumn("source_message_id",).execute();
  await database.schema.alterTable("actor_memories",).dropColumn("last_accessed_at",).execute();
  await database.schema.alterTable("actor_memories",).dropColumn("strength",).execute();
  await database.schema.alterTable("actor_memories",).dropColumn("decay_rate",).execute();
}
