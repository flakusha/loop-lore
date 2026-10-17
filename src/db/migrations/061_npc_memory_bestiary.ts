// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 061_npc_memory_bestiary
 *
 * NPC memory lifecycle + bestiary (epic-world-npcs: NPC memory, emotional
 * state, relationships, memory decay, monster/bestiary).
 *
 * Four new tables — none of this shape existed anywhere in the schema:
 *   - `npc_memories`      — per-NPC episodic/semantic memory with a
 *                           reinforcement-clock decay model
 *   - `npc_relationships` — one-directional NPC attitude toward ANY target
 *   - `monster_templates` — bestiary entries; `world_id` NULL = global
 *   - `monster_spawns`    — placed instances with a territorial radius
 *
 * Why NOT `actor_memories` (001:3072): that is the *chat-extraction* store —
 * built around `source_chat_id`/`source_message_id` provenance, carrying an
 * embedding row per memory (`memory_embeddings`, 001:3099) and a
 * review/privacy workflow (`review_status`, `privacy`, `shareability`,
 * `confidence`, `keywords`). Its `importance` is an unbounded small-integer
 * counter (default 1), not the 0..100 scale the NPC decay model is specified
 * against, and its `world_id` is a nullable non-FK. Folding NPC memory in
 * would mean six new columns on a 25-wide table plus a conflicting importance
 * range, and every NPC memory would inherit the chat review workflow.
 * Separate table; the memory_type/importance vocabulary is reused via enums.
 *
 * Why NOT `character_relationships` (001:1352): that models the *player's*
 * relationship graph and mirrors bidirectional rows
 * (src/characters/services/relationships-service/write.ts). NPC attitudes are
 * strictly one-directional (the NPC's own view) and `target_id` is
 * deliberately NOT an `actors.id` — an NPC can hold a grudge toward a
 * monster template, a faction, or a place, none of which have an actors row.
 * The FK pair + bidirectional mirror make that table unable to hold these
 * rows. New table; `standing` reuses the same -100..100 semantics.
 *
 * Numbering: 061 — 058/059/060/062 are held by sibling worktrees.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("npc_memories",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql.raw("(lower(hex(randomblob(16))))",),),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("npc_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("memory_type", "text", (col,) => col.notNull().defaultTo("episodic",),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    /** 0..100. Decays toward 0; a memory that reaches 0 is forgotten. */
    .addColumn("importance", "integer", (col,) => col.notNull().defaultTo(50,),)
    /** -100..100 signed affect; magnitude resists decay. */
    .addColumn("emotional_impact", "integer", (col,) => col.notNull().defaultTo(0,),)
    /** JSON array of actor ids present when the memory formed. */
    .addColumn("participants", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    /** Importance lost per day before the decay multipliers apply. */
    .addColumn("decay_rate", "real", (col,) => col.notNull().defaultTo(0.01,),)
    /** 1 = the memory was retold to others; shared memories resist decay. */
    .addColumn("shared", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql.raw("(datetime('now'))",),),)
    /** Decay clock origin — moved by reinforcement, never by decay itself. */
    .addColumn("last_reinforced_at", "text", (col,) => col.notNull().defaultTo(sql.raw("(datetime('now'))",),),)
    .addColumn("expires_at", "text",)
    .addCheckConstraint("ck_npc_memories_importance", sql.raw("importance BETWEEN 0 AND 100",),)
    .addCheckConstraint("ck_npc_memories_emotional_impact", sql.raw("emotional_impact BETWEEN -100 AND 100",),)
    .addCheckConstraint("ck_npc_memories_shared", sql.raw("shared IN (0, 1)",),)
    .addCheckConstraint("ck_npc_memories_decay_rate", sql.raw("decay_rate >= 0",),)
    .execute();

  await database.schema
    .createTable("npc_relationships",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql.raw("(lower(hex(randomblob(16))))",),),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    /** The NPC whose attitude this row records. */
    .addColumn("npc_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    /** Free-form: an actor id, a monster template id, a faction id, a name. */
    .addColumn("target_id", "text", (col,) => col.notNull(),)
    /** -100..100, same semantics as `character_relationships.standing`. */
    .addColumn("standing", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("relationship_type", "text", (col,) => col.notNull().defaultTo("stranger",),)
    /** -100..100 felt attachment, independent of reputational standing. */
    .addColumn("emotional_bond", "integer", (col,) => col.notNull().defaultTo(0,),)
    /** JSON array of `{ at, delta }` interaction entries. */
    .addColumn("history", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("last_interaction_at", "text", (col,) => col.notNull().defaultTo(sql.raw("(datetime('now'))",),),)
    .addCheckConstraint("ck_npc_relationships_standing", sql.raw("standing BETWEEN -100 AND 100",),)
    .addCheckConstraint("ck_npc_relationships_bond", sql.raw("emotional_bond BETWEEN -100 AND 100",),)
    .addUniqueConstraint("uq_npc_relationships_pair", ["world_id", "npc_id", "target_id",],)
    .execute();

  await database.schema
    .createTable("monster_templates",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql.raw("(lower(hex(randomblob(16))))",),),)
    /** NULL = global bestiary entry, visible from every world. */
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("subcategory", "text",)
    .addColumn("size", "text", (col,) => col.notNull().defaultTo("medium",),)
    .addColumn("alignment", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("difficulty", "text", (col,) => col.notNull().defaultTo("standard",),)
    /** JSON stat block `{ hp, ac, attackBonus, damage }`. */
    .addColumn("stats", "text", (col,) => col.notNull().defaultTo("{}",),)
    /** JSON array of `{ itemId, chance, quantity }` loot entries. */
    .addColumn("loot_table", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("territorial", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("nocturnal", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("pack_size", "integer", (col,) => col.notNull().defaultTo(1,),)
    /** JSON behaviour block `{ aggression, fleesBelowHpPct, ... }`. */
    .addColumn("behavior", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql.raw("(datetime('now'))",),),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql.raw("(datetime('now'))",),),)
    .addCheckConstraint("ck_monster_templates_territorial", sql.raw("territorial IN (0, 1)",),)
    .addCheckConstraint("ck_monster_templates_nocturnal", sql.raw("nocturnal IN (0, 1)",),)
    .addCheckConstraint("ck_monster_templates_pack_size", sql.raw("pack_size >= 1",),)
    .execute();

  await database.schema
    .createTable("monster_spawns",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql.raw("(lower(hex(randomblob(16))))",),),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("template_id", "text", (col,) => col.notNull().references("monster_templates.id",).onDelete("cascade",),)
    .addColumn("spawned_at", "text", (col,) => col.notNull().defaultTo(sql.raw("(datetime('now'))",),),)
    .addColumn("territory_center_x", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("territory_center_y", "real", (col,) => col.notNull().defaultTo(0,),)
    /** Metres. Containment is inclusive of the boundary circle. */
    .addColumn("territory_radius", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("despawn_at", "text",)
    .addCheckConstraint("ck_monster_spawns_territory_radius", sql.raw("territory_radius >= 0",),)
    .execute();

  await database.schema.createIndex("idx_npc_memories_npc",).on("npc_memories",).columns(["world_id", "npc_id",],)
    .execute();

  await database.schema.createIndex("idx_npc_memories_expires_at",).on("npc_memories",).column("expires_at",).execute();
  await database.schema
    .createIndex("idx_npc_relationships_npc",)
    .on("npc_relationships",)
    .columns(["world_id", "npc_id",],)
    .execute();

  await database.schema.createIndex("idx_monster_templates_world",).on("monster_templates",).column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_monster_spawns_location",)
    .on("monster_spawns",)
    .columns(["world_id", "location_id",],)
    .execute();

  await database.schema.createIndex("idx_monster_spawns_template",).on("monster_spawns",).column("template_id",)
    .execute();

  await database.schema.createIndex("idx_monster_spawns_despawn_at",).on("monster_spawns",).column("despawn_at",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_monster_spawns_despawn_at",).execute();
  await database.schema.dropIndex("idx_monster_spawns_template",).execute();
  await database.schema.dropIndex("idx_monster_spawns_location",).execute();
  await database.schema.dropIndex("idx_monster_templates_world",).execute();
  await database.schema.dropIndex("idx_npc_relationships_npc",).execute();
  await database.schema.dropIndex("idx_npc_memories_expires_at",).execute();
  await database.schema.dropIndex("idx_npc_memories_npc",).execute();
  await database.schema.dropTable("monster_spawns",).execute();
  await database.schema.dropTable("monster_templates",).execute();
  await database.schema.dropTable("npc_relationships",).execute();
  await database.schema.dropTable("npc_memories",).execute();
}
