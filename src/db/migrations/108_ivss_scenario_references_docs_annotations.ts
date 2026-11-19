// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 108_ivss_scenario_references_docs_annotations
 *
 * Completes the IVSS substrate after 107: ordered reference rows with an
 * explicit scope CHECK, versioned scenario docs, and review annotations with
 * a nullable resolution timestamp (no boolean flag). Reference lanes map to
 * runtime slots at compile time, not in storage.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("scenario_references",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("scenario_id", "text", (col,) => col.notNull().references("scenarios.id",).onDelete("cascade",),)
    .addColumn("scene_id", "text", (col,) => col.references("scenario_scenes.id",).onDelete("cascade",),)
    .addColumn("shot_id", "text", (col,) => col.references("scenario_shots.id",).onDelete("cascade",),)
    .addColumn("scope", "text", (col,) => col.notNull().defaultTo("scenario",),)
    .addColumn("lane", "text", (col,) => col.notNull(),)
    .addColumn("role", "text", (col,) => col,)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",).onDelete("cascade",),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("trim_in_ms", "integer", (col,) => col,)
    .addColumn("trim_out_ms", "integer", (col,) => col,)
    .addColumn("stream", "text", (col,) => col,)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint(
      "ck_scenario_references_scope",
      sql`(scope = 'scenario' AND scene_id IS NULL AND shot_id IS NULL) OR (scope = 'scene' AND scene_id IS NOT NULL AND shot_id IS NULL) OR (scope = 'shot' AND scene_id IS NOT NULL AND shot_id IS NOT NULL)`,
    )
    .execute();

  await database.schema
    .createTable("scenario_docs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("scenario_id", "text", (col,) => col.notNull().references("scenarios.id",).onDelete("cascade",),)
    .addColumn("kind", "text", (col,) => col.notNull(),)
    .addColumn("title", "text", (col,) => col,)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addUniqueConstraint("uq_scenario_docs_kind", ["scenario_id", "kind",],)
    .execute();

  await database.schema
    .createTable("annotations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("target_type", "text", (col,) => col.notNull(),)
    .addColumn("target_id", "text", (col,) => col.notNull(),)
    .addColumn("author_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("t0_ms", "integer", (col,) => col.notNull(),)
    .addColumn("t1_ms", "integer", (col,) => col,)
    .addColumn("region", "text", (col,) => col,)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("resolved_at", "text", (col,) => col,)
    .addColumn("resolved_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema.createIndex("idx_scenario_references_scope",).on("scenario_references",).columns([
    "scenario_id",
    "scope",
    "sort_order",
  ],).execute();

  await database.schema.createIndex("idx_scenario_docs_scenario",).on("scenario_docs",).columns(["scenario_id",],)
    .execute();

  await database.schema.createIndex("idx_annotations_target",).on("annotations",).columns([
    "target_type",
    "target_id",
    "resolved_at",
  ],).execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_annotations_target",).ifExists().execute();
  await database.schema.dropIndex("idx_scenario_docs_scenario",).ifExists().execute();
  await database.schema.dropIndex("idx_scenario_references_scope",).ifExists().execute();

  await database.schema.dropTable("annotations",).ifExists().execute();
  await database.schema.dropTable("scenario_docs",).ifExists().execute();
  await database.schema.dropTable("scenario_references",).ifExists().execute();
}
