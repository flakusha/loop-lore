// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 107_ivss_scenario_fragments
 *
 * IVSS substrate: scenario -> scenes -> shots -> render fragments. A fragment
 * is the render/resume unit, not a shot. It pins the workflow (id, hash,
 * version) and the operation, and keeps rendered video and reusable latent as
 * separate asset references so retakes and resume do not clobber siblings.
 * No field assumes a particular ComfyUI node pack. Seeds and takes are text
 * so values above 2^53 survive a round-trip.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("scenarios",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("draft",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("scenario_scenes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("scenario_id", "text", (col,) => col.notNull().references("scenarios.id",).onDelete("cascade",),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("mode", "text", (col,) => col.notNull().defaultTo("t2v",),)
    .addColumn("duration_frames", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("fps", "integer", (col,) => col.notNull().defaultTo(24,),)
    .addColumn("seed", "text", (col,) => col,)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("planned",),)
    .addColumn("generated_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("scenario_shots",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("scene_id", "text", (col,) => col.notNull().references("scenario_scenes.id",).onDelete("cascade",),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("start_ms", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("end_ms", "integer", (col,) => col.notNull(),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("cut_type", "text", (col,) => col.notNull().defaultTo("hard_cut",),)
    .addColumn("camera_json", "text", (col,) => col,)
    .addColumn("narration", "text", (col,) => col,)
    .execute();

  await database.schema
    .createTable("scenario_fragments",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("scene_id", "text", (col,) => col.notNull().references("scenario_scenes.id",).onDelete("cascade",),)
    .addColumn("shot_id", "text", (col,) => col.references("scenario_shots.id",).onDelete("set null",),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("operation", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("planned",),)
    .addColumn("workflow_id", "text", (col,) => col.notNull(),)
    .addColumn("workflow_hash", "text", (col,) => col.notNull(),)
    .addColumn("workflow_version", "text", (col,) => col,)
    .addColumn("node_versions", "text", (col,) => col,)
    .addColumn("mode", "text", (col,) => col,)
    .addColumn("seed", "text", (col,) => col,)
    .addColumn("duration_frames", "integer", (col,) => col,)
    .addColumn("transition", "text", (col,) => col.notNull().defaultTo("hard_cut",),)
    .addColumn("prompt_message_id", "text", (col,) => col.references("messages.id",).onDelete("set null",),)
    .addColumn("prompt_snapshot", "text", (col,) => col,)
    .addColumn("gallery_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("caption", "text", (col,) => col,)
    .addColumn("input_assets", "text", (col,) => col,)
    .addColumn("output_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("latent_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("parent_fragment_id", "text", (col,) => col.references("scenario_fragments.id",).onDelete("set null",),)
    .addColumn("take", "text", (col,) => col.notNull().defaultTo("0",),)
    .addColumn("cut_in_ms", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("cut_out_ms", "integer", (col,) => col,)
    .addColumn("error", "text", (col,) => col,)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema.createIndex("idx_scenarios_world",).on("scenarios",).columns(["world_id",],).execute();
  await database.schema.createIndex("idx_scenario_scenes_scenario",).on("scenario_scenes",).columns([
    "scenario_id",
    "sort_order",
  ],).execute();

  await database.schema.createIndex("idx_scenario_shots_scene",).on("scenario_shots",).columns([
    "scene_id",
    "sort_order",
  ],).execute();

  await database.schema.createIndex("idx_scenario_fragments_scene",).on("scenario_fragments",).columns([
    "scene_id",
    "sort_order",
  ],).execute();

  await database.schema.createIndex("idx_scenario_fragments_parent",).on("scenario_fragments",).columns([
    "parent_fragment_id",
  ],).execute();

  await database.schema.createIndex("idx_scenario_fragments_status",).on("scenario_fragments",).columns(["status",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_scenario_fragments_status",).ifExists().execute();
  await database.schema.dropIndex("idx_scenario_fragments_parent",).ifExists().execute();
  await database.schema.dropIndex("idx_scenario_fragments_scene",).ifExists().execute();
  await database.schema.dropIndex("idx_scenario_shots_scene",).ifExists().execute();
  await database.schema.dropIndex("idx_scenario_scenes_scenario",).ifExists().execute();
  await database.schema.dropIndex("idx_scenarios_world",).ifExists().execute();

  await database.schema.dropTable("scenario_fragments",).ifExists().execute();
  await database.schema.dropTable("scenario_shots",).ifExists().execute();
  await database.schema.dropTable("scenario_scenes",).ifExists().execute();
  await database.schema.dropTable("scenarios",).ifExists().execute();
}
