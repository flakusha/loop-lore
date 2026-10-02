// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 036_world_travel_simulation
 *
 * Timeline-driven party travel + NPC migration state
 * (TASK-world-simulation-timeline-driven-travel-patrol).
 *
 * Three tables, all world-scoped:
 *
 *   - `travel_parties`      — a party, its ordered route, and the
 *     cursor into that route. WORLD-scoped, deliberately NOT
 *     chat-scoped: `chat_participants` (src/chat/service/party.ts) is
 *     "who may post in this group chat", a conversation concern that
 *     ends with the chat. Travel is a world fact — a wolf pack does
 *     not stop walking because the chat that narrated it closed, and
 *     an NPC-led party has no chat at all. Party → chat transfer is a
 *     downstream effect (epic-party-migration owns it), not this
 *     table's identity.
 *   - `npc_migrations`      — a relocation schedule for one NPC:
 *     depart tick, arrive tick, origin/destination, cadence.
 *   - `world_travel_budget` — the fractional spend ledger.
 *
 * Why a separate fractional ledger: `autonomy_budget` (026) is an
 * INTEGER counter with a cap — `AutonomyGovernor.tryConsume` increments
 * `window_count` by exactly one. The ticket's "each action costs 0.05
 * budget unit" cannot be expressed as N consumes without billing 20
 * dispatches per action. See `src/rpg/world-travel/budget.ts`.
 *
 * Column conventions follow 027_world_simulation_state: `worlds.id`
 * cascades, `locations.id` / `actors.id` set null (a deleted location
 * must not delete a party that is merely passing through it).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("travel_parties",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("kind", "text", (col,) => col.notNull().defaultTo("patrol",),)
    .addColumn("cadence", "text", (col,) => col.notNull().defaultTo("patrol",),)
    /** Ordered location ids — the route. JSON text, like locations.connections. */
    .addColumn("route", "text", (col,) => col.notNull().defaultTo("[]",),)
    /** Progress cursor: index of the location the party is standing on. */
    .addColumn("route_index", "integer", (col,) => col.notNull().defaultTo(0,),)
    /** Route edges the party covers per tick. real, not integer: 0.5 is a half-tick cadence. */
    .addColumn("steps_per_tick", "real", (col,) => col.notNull().defaultTo(1,),)
    /** Fractional-edge carry between ticks, so a 0.5-edge speed still moves. */
    .addColumn("travel_progress", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("current_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    /** Last tick this party's state was advanced on — THE REPLAY LATCH.
     *  `advancePartyTravel` writes under `WHERE current_tick < :tick`, so a
     *  tick the scheduler replays after a crash matches no row and neither
     *  moves the party twice nor bills the world twice. The default is -1, NOT
     *  0: the scheduler's first tick IS tick 0 (`tick_count` starts at 0), so
     *  a 0 default would latch every new party shut for exactly one tick. */
    .addColumn("current_tick", "integer", (col,) => col.notNull().defaultTo(-1,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("idle",),)
    /** Collision deferral: earliest tick the party may try to arrive again. */
    .addColumn("blocked_until_tick", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_travel_parties_status", sql`status IN ('idle', 'traveling', 'resting', 'disbanded')`,)
    .execute();

  await database.schema
    .createIndex("idx_travel_parties_world",)
    .on("travel_parties",)
    .columns(["world_id",],)
    .execute();

  await database.schema
    .createTable("npc_migrations",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("origin_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("destination_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("depart_tick", "integer", (col,) => col.notNull(),)
    .addColumn("arrive_tick", "integer", (col,) => col.notNull(),)
    /** "scheduled" — one hop. "continuous" — shuttles back and forth forever. */
    .addColumn("cadence", "text", (col,) => col.notNull().defaultTo("scheduled",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("planned",),)
    /** Tick the current hop departed on; 0 = not departed yet. */
    .addColumn("last_depart_tick", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_npc_migrations_status", sql`status IN ('planned', 'in_transit', 'arrived')`,)
    .execute();

  await database.schema
    .createIndex("idx_npc_migrations_due",)
    .on("npc_migrations",)
    .columns(["world_id", "status", "arrive_tick",],)
    .execute();

  await database.schema
    .createTable("world_travel_budget",)
    .addColumn("world_id", "text", (col,) => col.primaryKey().references("worlds.id",).onDelete("cascade",),)
    /** Budget units already spent inside the current window. */
    .addColumn("spent", "real", (col,) => col.notNull().defaultTo(0,),)
    /** Ceiling in budget units. Ops-tunable per world. */
    .addColumn("ceiling", "real", (col,) => col.notNull().defaultTo(1,),)
    /** Tick the current window opened on; the window rolls by tick count. */
    .addColumn("window_start_tick", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("world_travel_budget",).execute();
  await database.schema.dropIndex("idx_npc_migrations_due",).execute();
  await database.schema.dropTable("npc_migrations",).execute();
  await database.schema.dropIndex("idx_travel_parties_world",).execute();
  await database.schema.dropTable("travel_parties",).execute();
}
