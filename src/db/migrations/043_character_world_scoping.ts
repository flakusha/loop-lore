/**
 * Character World Scoping — world_id on lore + character systems
 *
 * Extends the per-world character setup epic by making previously global-only
 * character data world-scopeable. Adds a nullable `world_id` column (NULL =
 * global / applies to all worlds; a value = scoped to that world) to:
 *
 *   - actor_lore_entries      — character lorebook entries
 *   - character_desire_profile — NSFW desire profile
 *   - character_seduction_skills — seduction skill levels
 *   - character_body_profile   — body/stamina profile
 *
 * See .plan/epics/epic-character-world-setup.md (world-scoping research matrix).
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  // SQLite ALTER TABLE supports one ADD COLUMN per statement.
  await db.schema
    .alterTable("actor_lore_entries",)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .execute();

  await db.schema
    .alterTable("character_desire_profile",)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .execute();

  await db.schema
    .alterTable("character_seduction_skills",)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .execute();

  await db.schema
    .alterTable("character_body_profile",)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .execute();

  await db.schema.createIndex("idx_actor_lore_entries_world",).on("actor_lore_entries",).column("world_id",)
    .execute();
  await db.schema.createIndex("idx_desire_profile_world",).on("character_desire_profile",).column("world_id",)
    .execute();
  await db.schema.createIndex("idx_seduction_skills_world",).on("character_seduction_skills",).column("world_id",)
    .execute();
  await db.schema.createIndex("idx_body_profile_world",).on("character_body_profile",).column("world_id",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropIndex("idx_body_profile_world",).execute();
  await db.schema.dropIndex("idx_seduction_skills_world",).execute();
  await db.schema.dropIndex("idx_desire_profile_world",).execute();
  await db.schema.dropIndex("idx_actor_lore_entries_world",).execute();

  await db.schema.alterTable("character_body_profile",).dropColumn("world_id",).execute();
  await db.schema.alterTable("character_seduction_skills",).dropColumn("world_id",).execute();
  await db.schema.alterTable("character_desire_profile",).dropColumn("world_id",).execute();
  await db.schema.alterTable("actor_lore_entries",).dropColumn("world_id",).execute();
}
