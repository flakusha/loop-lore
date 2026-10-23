// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 075_character_stat_allocation
 *
 * Persist allocated stat blocks and assigned gameplay traits per actor.
 * trait_id is app-validated against the frozen catalog (no FK).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("character_stat_allocation",)
    .addColumn("actor_id", "text", (column,) => column.primaryKey(),)
    .addColumn("world_id", "text", (column,) => column.notNull(),)
    .addColumn("allocated_str", "integer", (column,) => column.notNull(),)
    .addColumn("allocated_dex", "integer", (column,) => column.notNull(),)
    .addColumn("allocated_con", "integer", (column,) => column.notNull(),)
    .addColumn("allocated_int", "integer", (column,) => column.notNull(),)
    .addColumn("allocated_wis", "integer", (column,) => column.notNull(),)
    .addColumn("allocated_cha", "integer", (column,) => column.notNull(),)
    .addColumn("allocated_at", "text", (column,) => column.notNull(),)
    .addColumn("allocated_by_user_id", "text",)
    .addForeignKeyConstraint(
      "character_stat_allocation_actor_fk",
      ["actor_id",],
      "actors",
      ["id",],
      (foreign,) => foreign.onDelete("cascade",),
    )
    .addForeignKeyConstraint(
      "character_stat_allocation_world_fk",
      ["world_id",],
      "worlds",
      ["id",],
      (foreign,) => foreign.onDelete("cascade",),
    )
    .execute();

  await database.schema
    .createTable("character_trait_assignments",)
    .addColumn("actor_id", "text", (column,) => column.notNull(),)
    .addColumn("trait_id", "text", (column,) => column.notNull(),)
    .addColumn("world_id", "text", (column,) => column.notNull(),)
    .addColumn("granted_at", "text", (column,) => column.notNull(),)
    .addColumn("granted_by_user_id", "text",)
    .addPrimaryKeyConstraint("character_trait_assignments_pk", ["actor_id", "trait_id", "world_id",],)
    .addForeignKeyConstraint(
      "character_trait_assignments_actor_fk",
      ["actor_id",],
      "actors",
      ["id",],
      (foreign,) => foreign.onDelete("cascade",),
    )
    .addForeignKeyConstraint(
      "character_trait_assignments_world_fk",
      ["world_id",],
      "worlds",
      ["id",],
      (foreign,) => foreign.onDelete("cascade",),
    )
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("character_trait_assignments",).execute();

  await database.schema.dropTable("character_stat_allocation",).execute();
}
