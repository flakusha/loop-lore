// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 048 — Battle Equipment Durability Persistence
 *
 * Adds `durability` / `max_durability` to `actor_items` so equipped gear can
 * degrade during combat (IS7). The battle engine (`applyDurabilityDamage`)
 * already computes degradation; this lets it persist back to inventory.
 *
 * SQLite permits only one ADD COLUMN per ALTER TABLE statement, so the two
 * columns are added in separate statements.
 */
import { type Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("actor_items",)
    .addColumn("durability", "integer", (c,) => c.notNull().defaultTo(100,),)
    .execute();

  await db.schema
    .alterTable("actor_items",)
    .addColumn("max_durability", "integer", (c,) => c.notNull().defaultTo(100,),)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("actor_items",)
    .dropColumn("max_durability",)
    .execute();

  await db.schema
    .alterTable("actor_items",)
    .dropColumn("durability",)
    .execute();
}
