import { type Kysely, sql, } from "kysely";

/**
 * Achievements & Replayability — DB Schema
 *
 * Tables used by `src/rpg/achievements/service.ts` and
 * `src/rpg/replayability/service.ts` (player_achievements, achievements,
 * playthroughs, meta_progression) which were previously missing from the
 * migrations, causing runtime crashes when the services were exercised.
 *
 * Also adds the missing `dice_roll_history(user_id, chat_id)` index
 * (see `src/rpg/service.ts` `getDiceRollHistory` which filters on both).
 *
 * `player_id` columns reference `users.id` — the solo player is a user
 * (consistent with chat/user-scoped tables elsewhere in the schema).
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Achievements ────────────────────────────────────────────

  await database.schema
    .createTable("achievements",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("tier", "text", (col,) => col.notNull(),)
    .addColumn("icon", "text",)
    .addColumn("is_secret", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("is_hidden", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("unlock_condition", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("rewards", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_achievements_category",)
    .on("achievements",)
    .column("category",)
    .execute();

  // ── Player Achievements ─────────────────────────────────────

  await database.schema
    .createTable("player_achievements",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("player_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("achievement_id", "text", (col,) => col.notNull().references("achievements.id",).onDelete("cascade",),)
    .addColumn("progress", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("max_progress", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("locked",),)
    .addColumn("unlocked_at", "text",)
    .addColumn("claimed_at", "text",)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_player_achievements_player",)
    .on("player_achievements",)
    .column("player_id",)
    .execute();

  await database.schema
    .createIndex("idx_player_achievements_achievement",)
    .on("player_achievements",)
    .column("achievement_id",)
    .execute();

  // ── Playthroughs ────────────────────────────────────────────

  await database.schema
    .createTable("playthroughs",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("player_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("playthrough_number", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("difficulty", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("ending_id", "text",)
    .addColumn("ending_type", "text",)
    .addColumn("completion_time", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("choices_made", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("secrets_found", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("achievements_unlocked", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .execute();

  await database.schema
    .createIndex("idx_playthroughs_player_world",)
    .on("playthroughs",)
    .columns(["player_id", "world_id",],)
    .execute();

  // ── Meta Progression ────────────────────────────────────────

  await database.schema
    .createTable("meta_progression",)
    .addColumn("player_id", "text", (col,) => col.primaryKey().references("users.id",).onDelete("cascade",),)
    .addColumn("total_playthroughs", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("endings_seen", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("secrets_found", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("achievements_unlocked", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("permanent_bonuses", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("unlocked_content", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  // ── Dice Roll History index (user_id, chat_id) ──────────────
  // getDiceRollHistory filters by user_id and optionally chat_id.

  await database.schema
    .createIndex("idx_dice_roll_history_user_chat",)
    .on("dice_roll_history",)
    .columns(["user_id", "chat_id",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_dice_roll_history_user_chat",).execute();
  await database.schema.dropTable("meta_progression",).execute();
  await database.schema.dropTable("playthroughs",).execute();
  await database.schema.dropTable("player_achievements",).execute();
  await database.schema.dropTable("achievements",).execute();
}
