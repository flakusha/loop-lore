/**
 * World Timeline Events — DB Schema
 *
 * A world-scoped, chronological ledger of events (docs/spec/lore.md §5). Unlike
 * the per-story `world_events` JSON blob, this is a first-class relational table
 * keyed by `world_id`, giving established-history backstory seeding (§5.2), a
 * resolution target for forward event steering (§5.3), and the shared timeline
 * cross-story convergence reads from (§5.4).
 *
 * `occurred_at` is an ISO timestamp/in-world date that orders the timeline. When
 * a GM seeds an event with an explicit `occurred_at`, it renders as established
 * history rather than a fresh discovery. `story_id` records provenance so
 * per-session events can be attributed without breaking world-keyed order.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("world_timeline_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",).notNull(),)
    .addColumn("story_id", "text",)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text",)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("data", "text",)
    .addColumn("occurred_at", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .execute();

  // Chronological queries iterate a single world's timeline in order.
  await db.schema
    .createIndex("world_timeline_events_world_occurred_idx",)
    .on("world_timeline_events",)
    .columns(["world_id", "occurred_at",],)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropIndex("world_timeline_events_world_occurred_idx",).execute();
  await db.schema.dropTable("world_timeline_events",).execute();
}
