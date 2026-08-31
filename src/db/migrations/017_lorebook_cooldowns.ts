/**
 * Lorebook Cooldowns — DB Schema
 *
 * Adds cooldown_seconds and last_activated columns to actor_lore_entries
 * and world_lore_entries tables. Enables time-based activation gating
 * for lore entries.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  // Add cooldown columns to actor_lore_entries
  await db.schema
    .alterTable("actor_lore_entries",)
    .addColumn("cooldown_seconds", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await db.schema
    .alterTable("actor_lore_entries",)
    .addColumn("last_activated", "text",)
    .execute();

  // Add cooldown columns to world_lore_entries
  await db.schema
    .alterTable("world_lore_entries",)
    .addColumn("cooldown_seconds", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await db.schema
    .alterTable("world_lore_entries",)
    .addColumn("last_activated", "text",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  // Remove from world_lore_entries
  await db.schema.alterTable("world_lore_entries",).dropColumn("last_activated",).execute();
  await db.schema.alterTable("world_lore_entries",).dropColumn("cooldown_seconds",).execute();

  // Remove from actor_lore_entries
  await db.schema.alterTable("actor_lore_entries",).dropColumn("last_activated",).execute();
  await db.schema.alterTable("actor_lore_entries",).dropColumn("cooldown_seconds",).execute();
}
