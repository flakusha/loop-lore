// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Add per-instance item state used by durability, effects, and drift. */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("world_items",)
    .addColumn("properties", "text", (col,) => col.notNull().defaultTo("{}",),)
    .execute();
  await database.schema.alterTable("world_items",).addColumn("max_durability", "integer",).execute();
  await database.schema.alterTable("world_items",).addColumn("current_durability", "integer",).execute();
  await database.schema
    .alterTable("world_items",)
    .addColumn("is_active", "integer", (col,) => col.notNull().defaultTo(1,),)
    .execute();

  // Stackable and consumable instances do not carry durability. The service
  // repeats this rule for new rows; this keeps existing rows consistent.
  await sql`
    UPDATE world_items
       SET max_durability = NULL, current_durability = NULL
     WHERE item_id IN (
       SELECT id FROM items WHERE stackable = 'stackable' OR category = 'consumable'
     )
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("world_items",).dropColumn("properties",).execute();
  await database.schema.alterTable("world_items",).dropColumn("max_durability",).execute();
  await database.schema.alterTable("world_items",).dropColumn("current_durability",).execute();
  await database.schema.alterTable("world_items",).dropColumn("is_active",).execute();
}
