// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 034_content_versioning_heavy_tables
 *
 * Extends the `content_version` + `record_hash` pattern already carried by
 * `assets`, `characters`, `chats`, `messages`, `worlds`, and `actors` (see
 * 001_init) to 9 more content-heavy tables.
 *
 * Existing rows land at `content_version = 0` and `record_hash = ''`. A digest
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
    .addColumn("content_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("items",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn("content_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("actor_lore_entries",)
    .addColumn("content_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("actor_lore_entries",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("quests",)
    .addColumn("content_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("quests",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("locations",)
    .addColumn("content_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("locations",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("blog_posts",)
    .addColumn("content_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("blog_posts",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("shadow_notes",)
    .addColumn("content_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("shadow_notes",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("whitenotes",)
    .addColumn("content_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("whitenotes",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .alterTable("crafting_recipes",)
    .addColumn("content_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("crafting_recipes",)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("crafting_recipes",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("crafting_recipes",).dropColumn("content_version",).execute();
  await database.schema.alterTable("whitenotes",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("whitenotes",).dropColumn("content_version",).execute();
  await database.schema.alterTable("shadow_notes",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("shadow_notes",).dropColumn("content_version",).execute();
  await database.schema.alterTable("blog_posts",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("blog_posts",).dropColumn("content_version",).execute();
  await database.schema.alterTable("locations",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("locations",).dropColumn("content_version",).execute();
  await database.schema.alterTable("quests",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("quests",).dropColumn("content_version",).execute();
  await database.schema.alterTable("actor_lore_entries",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("actor_lore_entries",).dropColumn("content_version",).execute();
  await database.schema.alterTable("world_lore_entries",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("world_lore_entries",).dropColumn("content_version",).execute();
  await database.schema.alterTable("items",).dropColumn("record_hash",).execute();
  await database.schema.alterTable("items",).dropColumn("content_version",).execute();
}
