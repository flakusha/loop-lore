// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 082_prompt_templates_probe_checklist
 *
 * Confirm-checklist columns for the ComfyUI acceptance-probe gate on
 * `prompt_templates` workflow rows (TASK-comfyui-workflow-acceptance-probe-scaffold):
 *
 *   probe_status    — text ('unprobed' | 'passing' | 'failing'); existing rows
 *                     read back 'unprobed' via the column default.
 *   params_reviewed — integer 0/1, the SQLite boolean convention; existing
 *                     rows read back 0 via the column default.
 *   license         — nullable text; null when no license fence is recorded.
 *
 * One ADD COLUMN per alterTable statement, per
 * `src/db/migrations/README.md`. Dropping a NOT NULL column needs a table
 * rebuild, so `down` (like 023) rebuilds `prompt_templates` without these
 * columns — preserving every column the 023 down-rebuild kept, plus the
 * 023-added columns it removes here.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("prompt_templates",)
    .addColumn("probe_status", "text", (col,) => col.notNull().defaultTo("unprobed",),)
    .execute();

  await database.schema
    .alterTable("prompt_templates",)
    .addColumn("params_reviewed", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("prompt_templates",)
    .addColumn("license", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // SQLite cannot DROP COLUMN a NOT NULL column with a default, so the table
  // is rebuilt without them (same technique as 023's down).
  await sql`
    CREATE TEMP TABLE _pt_refs AS
    SELECT id, prompt_template_id FROM chats WHERE prompt_template_id IS NOT NULL
  `.execute(database,);

  await database.schema
    .createTable("prompt_templates_nocols",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("modality", "text", (col,) => col.notNull().defaultTo("llm",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("model_family", "text",)
    .addColumn("detail_level", "text", (col,) => col.notNull().defaultTo("balanced",),)
    .addColumn("payload", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("is_default", "text", (col,) => col.notNull().defaultTo("not_default",),)
    .addColumn("enabled", "text", (col,) => col.notNull().defaultTo("enabled",),)
    .addColumn("lora_slots", "text",)
    .addColumn("min_vram", "integer",)
    .execute();

  await sql`
    INSERT INTO prompt_templates_nocols (
      id, owner_id, modality, name, description, model_family,
      detail_level, payload, created_at, updated_at,
      is_default, enabled, lora_slots, min_vram
    )
    SELECT id, owner_id, modality, name, description, model_family,
           detail_level, payload, created_at, updated_at,
           is_default, enabled, lora_slots, min_vram
    FROM prompt_templates
  `.execute(database,);

  await database.schema.dropTable("prompt_templates",).execute();
  await database.schema.alterTable("prompt_templates_nocols",).renameTo("prompt_templates",).execute();

  await sql`
    UPDATE chats SET prompt_template_id = (
      SELECT prompt_template_id FROM _pt_refs WHERE _pt_refs.id = chats.id
    )
    WHERE id IN (SELECT id FROM _pt_refs)
  `.execute(database,);

  await sql`DROP TABLE _pt_refs`.execute(database,);

  await database.schema
    .createIndex("idx_prompt_templates_owner",)
    .on("prompt_templates",)
    .column("owner_id",)
    .execute();

  await database.schema
    .createIndex("idx_prompt_templates_modality",)
    .on("prompt_templates",)
    .column("modality",)
    .execute();

  // The table rebuild drops the 023 unique indexes; the 023 columns survive,
  // so their indexes come back (same definitions as 023's up).
  await sql`
    CREATE UNIQUE INDEX uq_prompt_templates_default_family
    ON prompt_templates (model_family, modality)
    WHERE is_default = 'default' AND model_family IS NOT NULL
  `.execute(database,);

  await sql`
    CREATE UNIQUE INDEX uq_prompt_templates_default_global
    ON prompt_templates (modality)
    WHERE is_default = 'default' AND model_family IS NULL
  `.execute(database,);
}
