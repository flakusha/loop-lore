import type { Kysely } from "kysely";

/**
 * Migration 011 — Memory decay and strength tracking
 *
 * Adds:
 * - `decay_rate` on `actor_memories`: float (0 = never decays, higher = faster fade)
 * - `strength` on `actor_memories`: float (1.0 = full encoding, decays per access pattern)
 * - `last_accessed_at` on `actor_memories`: tracks when memory was last retrieved for decay calc
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .alterTable("actor_memories")
    .addColumn("decay_rate", "real", (col) => col.notNull().defaultTo(0))
    .execute();

  await database.schema
    .alterTable("actor_memories")
    .addColumn("strength", "real", (col) => col.notNull().defaultTo(1))
    .execute();

  await database.schema
    .alterTable("actor_memories")
    .addColumn("last_accessed_at", "text")
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.alterTable("actor_memories").dropColumn("last_accessed_at").execute();
  await database.schema.alterTable("actor_memories").dropColumn("strength").execute();
  await database.schema.alterTable("actor_memories").dropColumn("decay_rate").execute();
}
