import { type Kysely, sql, } from "kysely";

/**
 * Character Skills — DB Schema
 *
 * Table used by `src/rpg/skills/service.ts` (SkillsService) which was
 * previously missing from the migrations, causing a runtime crash
 * (`no such table: character_skills`) whenever the service was exercised.
 *
 * Columns mirror the `Skill` interface in `src/rpg/skills/service.ts`.
 * `actor_id` references `actors.id` — skills are scoped to a character
 * actor (consistent with the other actor-scoped RPG tables in 010/011/012).
 * `world_id` is nullable to allow actor-global or world-scoped skills.
 * Booleans stored as integer, JSON arrays/objects as text — the schema's
 * established convention.
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("character_skills",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("xp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("proficiency", "text", (col,) => col.notNull().defaultTo("novice",),)
    .addColumn("specialization", "text",)
    .addColumn("is_locked", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("prerequisites", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_character_skills_actor",)
    .on("character_skills",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_character_skills_actor_world",)
    .on("character_skills",)
    .columns(["actor_id", "world_id",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_character_skills_actor_world",).execute();
  await database.schema.dropIndex("idx_character_skills_actor",).execute();
  await database.schema.dropTable("character_skills",).execute();
}
