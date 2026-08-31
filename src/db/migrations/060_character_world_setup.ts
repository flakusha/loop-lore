/**
 * Character World Setup — Per-World Setup Bundle (Layer 2 Overlay)
 *
 * Adds `character_world_setup`: one row per `(actor_id, world_id)` capturing
 * world-specific character setup that overlays the base `actors` setup.
 * Does not touch the base setup — a character is portable across worlds and
 * each world can layer its own starting inventory, world-scoped lore,
 * backstory-in-world-context, and scenario/system-prompt overrides.
 *
 * See .plan/epics/epic-character-world-setup.md.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("character_world_setup",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    // Starting inventory: JSON WorldSetupInventoryItem[] — items the character
    // begins with in this world. Current inventory stays in world_items.
    .addColumn("starting_inventory", "text", (col,) => col.notNull().defaultTo("[]",),)
    // World-scoped character lore: JSON WorldSetupLoreEntry[] (keys + content).
    .addColumn("lore_entries", "text", (col,) => col.notNull().defaultTo("[]",),)
    // World-context backstory reframing the character's history for this world.
    .addColumn("backstory", "text",)
    // Per-world prompt overrides (applied over base setup at prompt assembly).
    .addColumn("scenario_override", "text",)
    .addColumn("system_prompt_override", "text",)
    // Misc world-scoped parameters (standing, buffs, health floor, ...).
    .addColumn("initial_state", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .addUniqueConstraint("uq_character_world_setup_actor_world", ["actor_id", "world_id",],)
    .execute();

  await db.schema.createIndex("idx_character_world_setup_actor",).on("character_world_setup",).column("actor_id",)
    .execute();
  await db.schema.createIndex("idx_character_world_setup_world",).on("character_world_setup",).column("world_id",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropTable("character_world_setup",).execute();
}
