// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 060_world_resource_extraction
 *
 * Resource extraction (mining / gathering / fishing) + persistent location
 * storage (TASK-implement-resource-extraction-system,
 * TASK-implement-persistent-storage).
 *
 * THE NODE TABLE IS NOT RE-CREATED
 * --------------------------------
 * `gathering_node_defs` / `gathering_node_instances` / `gathering_node_materials`
 * already exist (001_init) and already own node identity, respawn
 * (`respawn_time_seconds` on the def, `respawn_at` on the instance) and the
 * per-def material table. A second node table would fork the same concept and
 * leave the crafting epic writing to one while extraction wrote to the other.
 * So this migration EXTENDS the existing instances in place with the three
 * fields extraction actually needs and the crafting schema never had:
 *
 *   - `quality`               — per-instance tier override. The DEF carries
 *                               `rarity` (what the node template is); a
 *                               concrete node on the map can roll better or
 *                               worse, which is why this is on the instance.
 *   - `extraction_difficulty` — the DC. Distinct from the def's
 *                               `skill_required`, which is a skill gate, not
 *                               a roll target.
 *   - `remaining_amount`      — how much is left. NULL means INFINITE, so a
 *                               renewable node (a river, an ore vein) needs no
 *                               respawn bookkeeping at all; a finite node
 *                               decrements and then falls back to the def's
 *                               `respawn_time_seconds` via `respawn_at`.
 *
 * One ADD COLUMN per alterTable statement (SQLite limitation; see
 * `src/db/migrations/README.md`).
 *
 * `extraction_rolls` is an append-only audit of every attempt — successes AND
 * failures — so a bad difficulty tuning is diagnosable after the fact. It
 * keeps the rolled `difficulty` and the serialized `yield` rather than only an
 * outcome, because "did it fail" is unanswerable without the DC it failed at.
 */
import { type Kysely, sql, } from "kysely";
import { ResourceQuality, } from "../enums-story/resources";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Extend the existing node instances, one column per statement ──
  await database.schema
    .alterTable("gathering_node_instances",)
    .addColumn("quality", "text", (col,) => col.notNull().defaultTo(ResourceQuality.Common,),)
    .execute();

  await database.schema
    .alterTable("gathering_node_instances",)
    .addColumn("extraction_difficulty", "integer", (col,) => col.notNull().defaultTo(10,),)
    .execute();

  /** NULL = infinite (renewable node, never depletes, no respawn needed). */
  await database.schema
    .alterTable("gathering_node_instances",)
    .addColumn("remaining_amount", "integer",)
    .execute();

  await database.schema
    .createIndex("idx_gathering_node_instances_world_location",)
    .on("gathering_node_instances",)
    .columns(["world_id", "location_id",],)
    .execute();

  // ── Persistent storage ──────────────────────────────────────
  await database.schema
    .createTable("location_storage",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    /** Total item UNITS the chest/crate/hold holds. 0 = holds nothing. */
    .addColumn("capacity", "integer", (col,) => col.notNull().defaultTo(0,),)
    /** 0 = anyone in the world may use it, 100 = owner-locked. */
    .addColumn("security", "integer", (col,) => col.notNull().defaultTo(0,),)
    /** JSON: { ownerActorId, allowedActorIds[], requireSecurity }. See
     *  `src/worlds/storage.ts` — `checkStorageAccess` is the only reader. */
    .addColumn("access_control", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_location_storage_capacity", sql`capacity >= 0`,)
    .addCheckConstraint("ck_location_storage_security", sql`security >= 0 AND security <= 100`,)
    .execute();

  // One container per (location, name) — two "Iron Chest" in one room is a
  // duplicate, and the name is what a player types to disambiguate.
  await database.schema
    .createIndex("idx_location_storage_location",)
    .on("location_storage",)
    .columns(["world_id", "location_id",],)
    .execute();

  await database.schema
    .createTable("location_storage_items",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("storage_id", "text", (col,) => col.notNull().references("location_storage.id",).onDelete("cascade",),)
    /** An item DEFINITION id (`items.id`), stacked — not a `world_items` row. */
    .addColumn("item_id", "text", (col,) => col.notNull().references("items.id",).onDelete("cascade",),)
    .addColumn("quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("stored_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_location_storage_items_quantity", sql`quantity > 0`,)
    .execute();

  // Stacking is the whole point of a container: one row per (storage, item),
  // so capacity accounting is a SUM over this index rather than a COUNT.
  await database.schema
    .createIndex("idx_location_storage_items_storage_item",)
    .on("location_storage_items",)
    .columns(["storage_id", "item_id",],)
    .unique()
    .execute();

  // ── Extraction audit log ────────────────────────────────────
  await database.schema
    .createTable("extraction_rolls",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn(
      "node_instance_id",
      "text",
      (col,) => col.notNull().references("gathering_node_instances.id",).onDelete("cascade",),
    )
    /** Set null on delete — the roll outlives the actor who made it. */
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",).onDelete("set null",),)
    .addColumn("attempted_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("succeeded", "integer", (col,) => col.notNull().defaultTo(0,),)
    /** The DC this attempt was resolved against, kept for tuning. */
    .addColumn("difficulty", "integer", (col,) => col.notNull().defaultTo(10,),)
    /** JSON array of { itemId, quantity }. Empty on failure. */
    .addColumn("yield", "text", (col,) => col.notNull().defaultTo("[]",),)
    .execute();

  await database.schema
    .createIndex("idx_extraction_rolls_node",)
    .on("extraction_rolls",)
    .columns(["node_instance_id", "attempted_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_extraction_rolls_node",).execute();
  await database.schema.dropTable("extraction_rolls",).execute();

  await database.schema.dropIndex("idx_location_storage_items_storage_item",).execute();
  await database.schema.dropTable("location_storage_items",).execute();

  await database.schema.dropIndex("idx_location_storage_location",).execute();
  await database.schema.dropTable("location_storage",).execute();

  await database.schema.dropIndex("idx_gathering_node_instances_world_location",).execute();
  await database.schema.alterTable("gathering_node_instances",).dropColumn("remaining_amount",).execute();
  await database.schema.alterTable("gathering_node_instances",).dropColumn("extraction_difficulty",).execute();
  await database.schema.alterTable("gathering_node_instances",).dropColumn("quality",).execute();
}
