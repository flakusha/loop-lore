// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 047 — Trade History
 *
 * Adds a `trade_history` table for persistent trade logging.
 * Enables querying past trades by actor, world, or date range.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("trade_history",)
    .addColumn("id", "text", (c,) => c.primaryKey(),)
    .addColumn("world_id", "text", (c,) => c.notNull(),)
    .addColumn("buyer_actor_id", "text", (c,) => c.notNull(),)
    .addColumn("seller_actor_id", "text", (c,) => c.notNull(),)
    .addColumn("price", "integer", (c,) => c.notNull().defaultTo(0,),)
    .addColumn("currency_type", "text", (c,) => c.notNull().defaultTo("gold",),)
    .addColumn("items_offered", "text", (c,) => c.notNull().defaultTo("[]",),)
    .addColumn("items_requested", "text", (c,) => c.notNull().defaultTo("[]",),)
    .addColumn("trade_type", "text", (c,) => c.notNull().defaultTo("player_player",),)
    .addColumn("created_at", "text", (c,) => c.notNull(),)
    .execute();

  await db.schema
    .createIndex("trade_history_world_idx",)
    .on("trade_history",)
    .column("world_id",)
    .execute();

  await db.schema
    .createIndex("trade_history_buyer_idx",)
    .on("trade_history",)
    .column("buyer_actor_id",)
    .execute();

  // ── Make crafting_orders.recipe_id nullable for trade offers ──
  // SQLite doesn't support ALTER COLUMN directly; we recreate.
  // Since DB is reinit, we can just alter. But SQLite limitation means
  // we add a trade_type column instead and use a sentinel for recipe_id.
  await db.schema
    .alterTable("crafting_orders",)
    .addColumn("trade_type", "text", (c,) => c.notNull().defaultTo("crafting",),)
    .execute();

  await db.schema
    .createIndex("trade_history_seller_idx",)
    .on("trade_history",)
    .column("seller_actor_id",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropIndex("trade_history_seller_idx",).execute();
  await db.schema.dropIndex("trade_history_buyer_idx",).execute();
  await db.schema.dropIndex("trade_history_world_idx",).execute();
  await db.schema.dropTable("trade_history",).execute();
}
