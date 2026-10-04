// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 034_content_versioning_heavy_tables
 *
 * Extends the `data_version` + `record_hash` pattern already carried by
 * `assets`, `characters`, `chats`, `messages`, `worlds`, and `actors` (see
 * 001_init) to 9 more content-heavy tables.
 *
 * Existing rows land at `data_version = 0` and `record_hash = ''`. A digest
 * of `''` is falsy, so every consumer of `record_hash` already treats these
 * as "not yet hashed" and skips them until the owning service runs a
 * `runBatchRefresh`. This keeps the migration non-destructive: no content is
 * rewritten and no hash is computed for a projection that has not been
 * registered yet.
 *
 * One ADD COLUMN per alterTable statement (SQLite limitation).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("items",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("items",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("actor_lore_entries",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("actor_lore_entries",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("quests",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("quests",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("locations",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("locations",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("blog_posts",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("blog_posts",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("shadow_notes",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("shadow_notes",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("whitenotes",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("whitenotes",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("crafting_recipes",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("crafting_recipes",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("crafting_recipes",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("crafting_recipes",).dropColumn("data_version",).execute();
  await database.schema.alterTable("whitenotes",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("whitenotes",).dropColumn("data_version",).execute();
  await database.schema.alterTable("shadow_notes",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("shadow_notes",).dropColumn("data_version",).execute();
  await database.schema.alterTable("blog_posts",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("blog_posts",).dropColumn("data_version",).execute();
  await database.schema.alterTable("locations",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("locations",).dropColumn("data_version",).execute();
  await database.schema.alterTable("quests",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("quests",).dropColumn("data_version",).execute();
  await database.schema.alterTable("actor_lore_entries",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("actor_lore_entries",).dropColumn("data_version",).execute();
  await database.schema.alterTable("world_lore_entries",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("world_lore_entries",).dropColumn("data_version",).execute();
  await database.schema.alterTable("items",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("items",).dropColumn("data_version",).execute();
}
