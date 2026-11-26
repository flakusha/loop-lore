// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 009_ivss — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("scenarios",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("draft",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("scenario_scenes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("scenario_id", "text", (col,) => col.notNull().references("scenarios.id",).onDelete("cascade",),)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("mode", "text", (col,) => col.defaultTo("t2v",).notNull(),)
    .addColumn("duration_frames", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("fps", "integer", (col,) => col.defaultTo(24,).notNull(),)
    .addColumn("seed", "text",)
    .addColumn("status", "text", (col,) => col.defaultTo("planned",).notNull(),)
    .addColumn("generated_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("scenario_shots",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("scene_id", "text", (col,) => col.notNull().references("scenario_scenes.id",).onDelete("cascade",),)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("start_ms", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("end_ms", "integer", (col,) => col.notNull(),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("cut_type", "text", (col,) => col.defaultTo("hard_cut",).notNull(),)
    .addColumn("camera_json", "text",)
    .addColumn("narration", "text",)
    .execute();

  await database.schema
    .createTable("scenario_fragments",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("scene_id", "text", (col,) => col.notNull().references("scenario_scenes.id",).onDelete("cascade",),)
    .addColumn("shot_id", "text", (col,) => col.references("scenario_shots.id",).onDelete("set null",),)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("operation", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("planned",).notNull(),)
    .addColumn("workflow_id", "text", (col,) => col.notNull(),)
    .addColumn("workflow_hash", "text", (col,) => col.notNull(),)
    .addColumn("workflow_version", "text",)
    .addColumn("node_versions", "text",)
    .addColumn("mode", "text",)
    .addColumn("seed", "text",)
    .addColumn("duration_frames", "integer",)
    .addColumn("transition", "text", (col,) => col.defaultTo("hard_cut",).notNull(),)
    .addColumn("prompt_message_id", "text", (col,) => col.references("messages.id",).onDelete("set null",),)
    .addColumn("prompt_snapshot", "text",)
    .addColumn("gallery_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("caption", "text",)
    .addColumn("input_assets", "text",)
    .addColumn("output_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("latent_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("parent_fragment_id", "text", (col,) => col.references("scenario_fragments.id",).onDelete("set null",),)
    .addColumn("take", "text", (col,) => col.defaultTo("0",).notNull(),)
    .addColumn("cut_in_ms", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("cut_out_ms", "integer",)
    .addColumn("error", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("scenario_references",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("scenario_id", "text", (col,) => col.notNull().references("scenarios.id",).onDelete("cascade",),)
    .addColumn("scene_id", "text", (col,) => col.references("scenario_scenes.id",).onDelete("cascade",),)
    .addColumn("shot_id", "text", (col,) => col.references("scenario_shots.id",).onDelete("cascade",),)
    .addColumn("scope", "text", (col,) => col.defaultTo("scenario",).notNull(),)
    .addColumn("lane", "text", (col,) => col.notNull(),)
    .addColumn("role", "text",)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",).onDelete("cascade",),)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("trim_in_ms", "integer",)
    .addColumn("trim_out_ms", "integer",)
    .addColumn("stream", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
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
    .addColumn("title", "text",)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addUniqueConstraint("uq_scenario_docs_kind", ["scenario_id", "kind",],)
    .execute();

  await database.schema
    .createTable("annotations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("target_type", "text", (col,) => col.notNull(),)
    .addColumn("target_id", "text", (col,) => col.notNull(),)
    .addColumn("author_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("t0_ms", "integer", (col,) => col.notNull(),)
    .addColumn("t1_ms", "integer",)
    .addColumn("region", "text",)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("resolved_at", "text",)
    .addColumn("resolved_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("scenario_assemblies",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("scenario_id", "text", (col,) => col.notNull().references("scenarios.id",).onDelete("cascade",),)
    .addColumn("version", "integer", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull(),)
    .addColumn("workflow_id", "text",)
    .addColumn("workflow_hash", "text",)
    .addColumn("workflow_version", "text",)
    .addColumn("fragment_ids", "text", (col,) => col.notNull(),)
    .addColumn("cut_points", "text", (col,) => col.notNull(),)
    .addColumn("output_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("error", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  // raw index: idx_annotations_target
  await sql`CREATE INDEX "idx_annotations_target" on "annotations" ("target_type", "target_id", "resolved_at")`.execute(
    database,
  );

  // raw index: idx_scenario_assemblies_scenario_version
  await sql`CREATE INDEX "idx_scenario_assemblies_scenario_version" on "scenario_assemblies" ("scenario_id", "version")`
    .execute(database,);

  // raw index: idx_scenario_docs_scenario
  await sql`CREATE INDEX "idx_scenario_docs_scenario" on "scenario_docs" ("scenario_id")`.execute(database,);
  // raw index: idx_scenario_fragments_parent
  await sql`CREATE INDEX "idx_scenario_fragments_parent" on "scenario_fragments" ("parent_fragment_id")`.execute(
    database,
  );

  // raw index: idx_scenario_fragments_scene
  await sql`CREATE INDEX "idx_scenario_fragments_scene" on "scenario_fragments" ("scene_id", "sort_order")`.execute(
    database,
  );

  // raw index: idx_scenario_fragments_status
  await sql`CREATE INDEX "idx_scenario_fragments_status" on "scenario_fragments" ("status")`.execute(database,);
  // raw index: idx_scenario_references_scope
  await sql`CREATE INDEX "idx_scenario_references_scope" on "scenario_references" ("scenario_id", "scope", "sort_order")`
    .execute(database,);

  // raw index: idx_scenario_scenes_scenario
  await sql`CREATE INDEX "idx_scenario_scenes_scenario" on "scenario_scenes" ("scenario_id", "sort_order")`.execute(
    database,
  );

  // raw index: idx_scenario_shots_scene
  await sql`CREATE INDEX "idx_scenario_shots_scene" on "scenario_shots" ("scene_id", "sort_order")`.execute(database,);
  // raw index: idx_scenarios_world
  await sql`CREATE INDEX "idx_scenarios_world" on "scenarios" ("world_id")`.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("scenario_assemblies",).execute();
  await database.schema.dropTable("annotations",).execute();
  await database.schema.dropTable("scenario_docs",).execute();
  await database.schema.dropTable("scenario_references",).execute();
  await database.schema.dropTable("scenario_fragments",).execute();
  await database.schema.dropTable("scenario_shots",).execute();
  await database.schema.dropTable("scenario_scenes",).execute();
  await database.schema.dropTable("scenarios",).execute();
}
