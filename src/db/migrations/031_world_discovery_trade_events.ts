// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 031_world_discovery_trade_events
 *
 * World-scoped simulation log + exploration progress
 * (TASK-world-simulation-discovery-and-trade-events).
 *
 * Two tables, both world-scoped like 030:
 *
 *   - `world_event_log`    — append-only event log for the tick.
 *   - `location_discovery` — per-(location, actor) exploration progress.
 *
 * NAME — why `world_event_log` and not `world_events`
 * ---------------------------------------------------
 * `world_events` is ALREADY TAKEN as a column name: `story_turns`
 * .world_events (`src/db/schema-story.ts:208`, defined in 001_init at
 * :1943, written by `src/story/game-master/accept.ts:116`). That
 * column is one JSON blob per GM turn — chat-scoped, per-turn,
 * ephemeral, with no world scope, no type column and no tick. Reusing
 * the bare name gives two unrelated things one identifier in a single
 * schema, and `SELECT world_events FROM world_event_log` reads as a
 * typo of `story_turns.world_events`. `world_event_log` says what it
 * is: the LOG. The ticket's own wording is "written to a `world_events`
 * LOG", so this is the log it asked for, under a name the schema can
 * carry alongside the existing column.
 *
 * REPLAY SAFETY — the scheduler replays at most one world tick after a
 * crash (`src/autonomy/scheduler/README.md`, Persistence). Two columns
 * make that a no-op at the storage layer rather than a convention a
 * reader has to remember:
 *
 *   - `world_event_log.dedupe_key` is UNIQUE. Every writer supplies one,
 *     so a replayed tick that re-derives the same event loses the
 *     insert instead of appending a twin. `location:discovered` keys on
 *     the LOCATION (`discovered:<world>:<location>`, no tick), so the
 *     threshold can never announce the same find twice even when two
 *     actors cross it on one tick; `trade:route` keys on the tick AND
 *     the subject, because a convoy is legitimately in motion on many
 *     ticks.
 *   - `location_discovery.last_explored_tick` is the replay latch.
 *     Progress is RECOMPUTED from (stored value, ticks elapsed) and
 *     written under `WHERE last_explored_tick < :tick`, so a replayed
 *     tick matches no rows and writes nothing. `travel_parties`
 *     .current_tick is the same idea one column over.
 *
 * WHY THE CLOCK IS A TICK, NOT A TIMESTAMP: `last_explored_tick` IS
 * the decay timestamp — progress bleeds per tick since it was last
 * explored. A tick index is the only clock a replay reproduces exactly,
 * so a replay decays by precisely what the original decay did.
 *
 * Column conventions follow 027/030: `worlds.id` cascades,
 * `locations.id` / `actors.id` cascade on `location_discovery` (the row
 * IS "this actor's progress at this location", meaningless without
 * both) and set null on `world_event_log.actor_id` (the event outlives
 * the actor).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("world_event_log")
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id").onDelete("cascade"),)
    /** Open vocabulary: `location:discovered` and `trade:route` today; later
     * migrations add types without an ALTER for a closed enum. */
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    /** What the event is ABOUT — a location id, a party id. Free text: the two
     * event families name different kinds of thing and neither can cascade. */
    .addColumn("subject_id", "text",)
    /** WHO caused it, when that is an actor. Set null on delete — the event
     * outlives the actor who fired it. */
    .addColumn("actor_id", "text", (col,) => col.references("actors.id").onDelete("set null"),)
    /** JSON text, like `locations.connections` and `story_turns.world_events`. */
    .addColumn("payload", "text", (col,) => col.notNull().defaultTo("{}"),)
    /** The tick that produced it — the log's natural ordering key. */
    .addColumn("tick_index", "integer", (col,) => col.notNull(),)
    /** UNIQUE idempotency key. See the REPLAY SAFETY note above. */
    .addColumn("dedupe_key", "text", (col,) => col.notNull().unique(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`),)
    .execute();

  // The admin listing and every tick-time read are both
  // `WHERE world_id = ? ORDER BY tick_index DESC`, so this index IS the
  // access path. `id` rides along so the ORDER BY is total: two events on
  // one tick must never swap places between pages or between runs.
  await database.schema
    .createIndex("idx_world_event_log_world_tick")
    .on("world_event_log")
    .columns(["world_id", "tick_index", "id",],)
    .execute();

  await database.schema
    .createTable("location_discovery")
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id").onDelete("cascade"),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id").onDelete("cascade"),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id").onDelete("cascade"),)
    /** 0-100, matching epic-world-locations' `explorationProgress`. */
    .addColumn("progress", "real", (col,) => col.notNull().defaultTo(0,),)
    /** THE DECAY TIMESTAMP: the tick progress was last recomputed on. Also
     * the replay latch — a tick at or below this writes nothing. */
    .addColumn("last_explored_tick", "integer", (col,) => col.notNull().defaultTo(0,),)
    /** 1 = this actor has charted the location. Latches; never clears. */
    .addColumn("discovered", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("discovered_tick", "integer",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`),)
    .addPrimaryKeyConstraint("pk_location_discovery", ["world_id", "location_id", "actor_id",],)
    .addCheckConstraint("ck_location_discovery_progress", sql`progress >= 0 AND progress <= 100`,)
    .execute();

  // "Has anybody charted this location?" is asked per tick (the
  // exactly-once guard) and per location by any fog-of-war view. It is
  // not the PK order, so it needs its own index.
  await database.schema
    .createIndex("idx_location_discovery_location")
    .on("location_discovery")
    .columns(["world_id", "location_id"],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_location_discovery_location").execute();
  await database.schema.dropTable("location_discovery").execute();
  await database.schema.dropIndex("idx_world_event_log_world_tick").execute();
  await database.schema.dropTable("world_event_log").execute();
}
