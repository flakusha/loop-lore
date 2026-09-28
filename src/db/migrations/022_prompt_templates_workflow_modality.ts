// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 022_prompt_templates_workflow_modality
 *
 * Add the `workflow` modality to the prompt-template library, plus the four
 * columns the ComfyUI workflow library needs.
 *
 * ── Why this is a table rebuild, not four ADD COLUMNs ──────────
 *
 * The epic design assumed `modality` was an unconstrained text column and
 * that "SQLite needs no table rebuild to accept a new value". That is false.
 * 001_init.ts:3308-3311 created:
 *
 *     CONSTRAINT ck_prompt_templates_modality
 *       CHECK (modality IN ('llm', 'image', 'video', 'audio'))
 *
 * SQLite cannot ALTER a CHECK constraint, so the table must be rebuilt.
 * `003_memory_audit_log_action_check` dodged this with a BEFORE INSERT
 * trigger, but that trick only works for a table that has *no* existing
 * CHECK — a trigger cannot suppress one, so it is not an option here.
 *
 * ── Why the rebuild is not the naive one ───────────────────────
 *
 * `chats.prompt_template_id` references this table with ON DELETE SET NULL
 * (001_init.ts:3317). A rebuild drops the old table, which fires that action
 * and silently NULLs every chat's template binding. Kysely wraps each
 * migration in a transaction, so `PRAGMA foreign_keys = OFF` is a no-op
 * inside it, and `PRAGMA defer_foreign_keys = ON` does NOT help either:
 * it defers constraint *enforcement*, not ON DELETE *actions*. Both were
 * verified empirically before this migration was written.
 *
 * So the referencing column is snapshotted into a temp table, the rebuild
 * runs, and the values are written back. `foreign_key_check` afterwards is
 * clean and every non-NULL `chats.prompt_template_id` survives.
 *
 * ── Columns added ──────────────────────────────────────────────
 *
 * Deliberately NOT here. The two schema generators rebuild a table from its
 * `createTable` and then apply `alterTable` adds; a column first appearing on
 * a table that is later dropped-and-renamed is discarded, so the generated
 * `PromptTemplates` interface silently kept 10 columns. The four library
 * columns therefore live in 022, as plain `addColumn` alters, which the
 * generators model correctly. Verified by re-running `db:sync-types`.
 *
 * Append-only policy (`src/db/migrations/README.md`): forward change only;
 * 001_init.ts is shipped and is not rewritten.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // Snapshot the inbound references. `chats` is the only table pointing at
  // prompt_templates (verified against every migration).
  await sql`
    CREATE TEMP TABLE _pt_refs AS
    SELECT id, prompt_template_id FROM chats WHERE prompt_template_id IS NOT NULL
  `.execute(database,);

  await database.schema
    .createTable("prompt_templates_new",)
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
    .addCheckConstraint(
      "ck_prompt_templates_modality",
      sql`modality IN ('llm', 'image', 'video', 'audio', 'workflow')`,
    )
    .execute();

  // Column-for-column copy; the shape is identical apart from the CHECK.
  await sql`
    INSERT INTO prompt_templates_new (
      id, owner_id, modality, name, description, model_family,
      detail_level, payload, created_at, updated_at
    )
    SELECT id, owner_id, modality, name, description, model_family,
           detail_level, payload, created_at, updated_at
    FROM prompt_templates
  `.execute(database,);

  await database.schema.dropTable("prompt_templates",).execute();
  await database.schema.alterTable("prompt_templates_new",).renameTo("prompt_templates",).execute();

  // Restore the bindings the DROP above nulled.
  await sql`
    UPDATE chats SET prompt_template_id = (
      SELECT prompt_template_id FROM _pt_refs WHERE _pt_refs.id = chats.id
    )
    WHERE id IN (SELECT id FROM _pt_refs)
  `.execute(database,);
  await sql`DROP TABLE _pt_refs`.execute(database,);

  // Indexes are dropped along with the old table; recreate them.
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

export async function down(database: Kysely<unknown>,): Promise<void> {
  // The old CHECK has no 'workflow' value, so these rows cannot survive the
  // rebuild. This is the documented cost of rolling this migration back.
  await sql`DELETE FROM prompt_templates WHERE modality = 'workflow'`.execute(database,);

  await sql`
    CREATE TEMP TABLE _pt_refs AS
    SELECT id, prompt_template_id FROM chats WHERE prompt_template_id IS NOT NULL
  `.execute(database,);

  await database.schema
    .createTable("prompt_templates_old",)
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
    .addCheckConstraint(
      "ck_prompt_templates_modality",
      sql`modality IN ('llm', 'image', 'video', 'audio')`,
    )
    .execute();

  await sql`
    INSERT INTO prompt_templates_old (
      id, owner_id, modality, name, description, model_family,
      detail_level, payload, created_at, updated_at
    )
    SELECT id, owner_id, modality, name, description, model_family,
           detail_level, payload, created_at, updated_at
    FROM prompt_templates
  `.execute(database,);

  await database.schema.dropTable("prompt_templates",).execute();
  await database.schema.alterTable("prompt_templates_old",).renameTo("prompt_templates",).execute();

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
