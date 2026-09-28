// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 023_prompt_templates_workflow_columns
 *
 * The four columns the ComfyUI workflow library needs on `prompt_templates`.
 * Split out of 022 on purpose: 022 rebuilds the table to relax
 * `ck_prompt_templates_modality`, and both schema generators rebuild a table
 * from its `createTable` and then apply `alterTable` adds. A column that
 * first appears on a table which is later dropped-and-renamed is discarded,
 * so declaring these inside 022 left the generated `PromptTemplates`
 * interface at 10 columns while the live table had 14. As plain adds here the
 * generators model them correctly.
 *
 *   is_default — text DefaultState ('default' | 'not_default'), matching the
 *                existing enum-per-flag convention (see column-types.ts).
 *   enabled    — text LoreEntryStatus, same convention.
 *   lora_slots — JSON text; declared LoRA slot descriptors (Phase 4).
 *   min_vram   — integer; operator's minimum VRAM hint in MiB.
 *
 * Existing rows take the column defaults, so nothing becomes the default
 * workflow retroactively and nothing is disabled.
 *
 * One ADD COLUMN per alterTable statement, per
 * `src/db/migrations/README.md`.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("prompt_templates",)
    .addColumn("is_default", "text", (col,) => col.notNull().defaultTo("not_default",),)
    .execute();

  await database.schema
    .alterTable("prompt_templates",)
    .addColumn("enabled", "text", (col,) => col.notNull().defaultTo("enabled",),)
    .execute();

  await database.schema
    .alterTable("prompt_templates",)
    .addColumn("lora_slots", "text",)
    .execute();

  await database.schema
    .alterTable("prompt_templates",)
    .addColumn("min_vram", "integer",)
    .execute();

  // One default per (model_family, modality). Two indexes because SQLite
  // does not collapse NULLs in unique indexes (see
  // 020_actor_story_points_partial_unique for the same hazard).
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

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS uq_prompt_templates_default_global`.execute(database,);
  await sql`DROP INDEX IF EXISTS uq_prompt_templates_default_family`.execute(database,);

  // SQLite cannot DROP COLUMN a NOT NULL column with a default, so the table
  // is rebuilt without them.
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
    .execute();

  await sql`
    INSERT INTO prompt_templates_nocols (
      id, owner_id, modality, name, description, model_family,
      detail_level, payload, created_at, updated_at
    )
    SELECT id, owner_id, modality, name, description, model_family,
           detail_level, payload, created_at, updated_at
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
}
