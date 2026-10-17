// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 062_factions_karma
 *
 * World factions, diplomacy, karma, and per-actor faction standing
 * (epic-world-diplomacy-karma).
 *
 *   - `factions` — a world-scoped organization: alignment, its stated
 *     values (JSON list) and the location ids it claims (JSON list).
 *   - `faction_memberships` — who belongs to a faction and with what
 *     role. UNIQUE(faction_id, actor_id): an actor holds one seat.
 *   - `faction_relationships` — ONE row per unordered faction pair,
 *     normalized so the lower id is always `faction_a_id` (the UNIQUE
 *     constraint plus the writer's sort in src/worlds/factions.ts make a
 *     double-write impossible). `history_json` is the append-only
 *     diplomatic log: war, peace, alliance, betrayal.
 *   - `faction_standing` — an ACTOR's standing (-100..100) with one
 *     faction, plus the tallies quests/items/enemies that moved it.
 *     Deliberately NOT the faction-to-faction score above.
 *   - `karma_profiles` / `karma_events` — the actor's karma ledger:
 *     a running `overall` score, a per-category breakdown (JSON map),
 *     and the append-only events that produced both.
 *
 * Column conventions follow 052_world_timescale: app-supplied text ids,
 * `worlds.id` cascades, text timestamps default to `datetime('now')`.
 */
import { type Kysely, sql, } from "kysely";

/** `datetime('now')` default for every timestamp column below. */
const NOW = sql`(datetime('now'))`;

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("factions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("alignment", "text", (col,) => col.notNull().defaultTo("true_neutral",),)
    /** Stated values: [{ name, weight }]. */
    .addColumn("values_json", "text", (col,) => col.notNull().defaultTo("[]",),)
    /** Location ids this faction claims. */
    .addColumn("territory_json", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(NOW,),)
    .addUniqueConstraint("uq_factions_world_name", ["world_id", "name",],)
    .addCheckConstraint(
      "ck_factions_alignment",
      sql.raw(
        "alignment IN ('lawful_good', 'neutral_good', 'chaotic_good', 'lawful_neutral', 'true_neutral', 'chaotic_neutral', 'lawful_evil', 'neutral_evil', 'chaotic_evil')",
      ),
    )
    .execute();

  await database.schema
    .createTable("faction_memberships",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("faction_id", "text", (col,) => col.notNull().references("factions.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("role", "text", (col,) => col.notNull().defaultTo("member",),)
    .addColumn("joined_at", "text", (col,) => col.notNull().defaultTo(NOW,),)
    .addUniqueConstraint("uq_faction_memberships_seat", ["faction_id", "actor_id",],)
    .addCheckConstraint(
      "ck_faction_memberships_role",
      sql.raw("role IN ('leader', 'officer', 'member', 'ally')",),
    )
    .execute();

  await database.schema
    .createTable("faction_relationships",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    /** Always the lower of the two faction ids. */
    .addColumn("faction_a_id", "text", (col,) => col.notNull().references("factions.id",).onDelete("cascade",),)
    .addColumn("faction_b_id", "text", (col,) => col.notNull().references("factions.id",).onDelete("cascade",),)
    /** Symmetric pair score, -100..100 (hostile..allied). */
    .addColumn("standing", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("neutral",),)
    /** Append-only diplomatic log: [{ at, action, fromStatus, toStatus, standing, reason }]. */
    .addColumn("history_json", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(NOW,),)
    .addUniqueConstraint("uq_faction_relationships_pair", ["faction_a_id", "faction_b_id",],)
    .addCheckConstraint("ck_faction_relationships_no_self", sql.raw("faction_a_id != faction_b_id",),)
    .addCheckConstraint("ck_faction_relationships_standing", sql.raw("standing >= -100 AND standing <= 100",),)
    .addCheckConstraint(
      "ck_faction_relationships_status",
      sql.raw("status IN ('allied', 'friendly', 'neutral', 'unfriendly', 'hostile', 'at_war')",),
    )
    .execute();

  await database.schema
    .createTable("faction_standing",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("faction_id", "text", (col,) => col.notNull().references("factions.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("standing", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("quests_completed", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("quests_failed", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("items_traded", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("enemies_killed", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(NOW,),)
    .addUniqueConstraint("uq_faction_standing_actor", ["world_id", "faction_id", "actor_id",],)
    .addCheckConstraint("ck_faction_standing_range", sql.raw("standing >= -100 AND standing <= 100",),)
    .execute();

  await database.schema
    .createTable("karma_profiles",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("overall", "real", (col,) => col.notNull().defaultTo(0,),)
    /** Per-category running totals: { honor: 12, cruelty: -4 }. */
    .addColumn("categories_json", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(NOW,),)
    .addUniqueConstraint("uq_karma_profiles_actor", ["world_id", "actor_id",],)
    .addCheckConstraint("ck_karma_profiles_overall", sql.raw("overall >= -100 AND overall <= 100",),)
    .execute();

  await database.schema
    .createTable("karma_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("delta", "real", (col,) => col.notNull(),)
    .addColumn("reason", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("occurred_at", "text", (col,) => col.notNull().defaultTo(NOW,),)
    .addCheckConstraint(
      "ck_karma_events_category",
      sql.raw(
        "category IN ('honor', 'mercy', 'justice', 'craft', 'greed', 'cruelty', 'treachery', 'piety')",
      ),
    )
    .execute();

  await database.schema
    .createIndex("idx_factions_world",)
    .on("factions",)
    .columns(["world_id",],)
    .execute();

  await database.schema
    .createIndex("idx_faction_memberships_actor",)
    .on("faction_memberships",)
    .columns(["actor_id",],)
    .execute();

  await database.schema
    .createIndex("idx_faction_relationships_world",)
    .on("faction_relationships",)
    .columns(["world_id",],)
    .execute();

  await database.schema
    .createIndex("idx_faction_standing_actor",)
    .on("faction_standing",)
    .columns(["world_id", "actor_id",],)
    .execute();

  await database.schema
    .createIndex("idx_karma_events_actor",)
    .on("karma_events",)
    .columns(["world_id", "actor_id", "occurred_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_karma_events_actor",).execute();
  await database.schema.dropTable("karma_events",).execute();
  await database.schema.dropTable("karma_profiles",).execute();
  await database.schema.dropIndex("idx_faction_standing_actor",).execute();
  await database.schema.dropTable("faction_standing",).execute();
  await database.schema.dropIndex("idx_faction_relationships_world",).execute();
  await database.schema.dropTable("faction_relationships",).execute();
  await database.schema.dropIndex("idx_faction_memberships_actor",).execute();
  await database.schema.dropTable("faction_memberships",).execute();
  await database.schema.dropIndex("idx_factions_world",).execute();
  await database.schema.dropTable("factions",).execute();
}
