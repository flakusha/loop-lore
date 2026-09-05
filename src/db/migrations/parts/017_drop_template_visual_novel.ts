// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Drop the legacy `chat_setup_templates.visual_novel` integer column.
 *
 * `gm_config.renderingOverride` is now the sole source of truth for VN mode
 * on templates (and chats), per
 * `TASK-validate-and-fix-fe-be-db-gaps-for-chat-vn-settings`
 * (umbrella 66c4c3d). Any existing `visual_novel=1` rows are backfilled into
 * `gm_config.renderingOverride="visual_novel"` so the user-visible setting
 * survives the column drop. Non-0/1 values are logged and coerced to the
 * safe default of "no override" — matching the transactional style of
 * `boolToEnum` in `src/db/migration-helpers.ts`.
 *
 * Append-only migration — wired into `001_init.ts` in dependency order after
 * 016_fts. Never modify a shipped part.
 */
import { safeJsonParse, safeJsonStringify, } from "@/utils/safe-json";
import { type Kysely, sql, } from "kysely";

interface TemplateRow {
  id: string;
  gm_config: string | null;
  visual_novel: number | null;
}

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // 1. Backfill: any template with visual_novel=1 gets renderingOverride
  //    merged into its existing gm_config JSON. Non-0/1 values are logged.
  const result = await sql<TemplateRow>`
    SELECT id, gm_config, visual_novel
      FROM chat_setup_templates
     WHERE visual_novel IS NOT NULL
  `.execute(database,);

  for (const row of result.rows) {
    const flag = Number(row.visual_novel,);
    if (!Number.isFinite(flag,) || (flag !== 0 && flag !== 1)) {
      console.warn(
        `[017_drop_template_visual_novel] template ${row.id} had unexpected visual_novel=${row.visual_novel}; leaving gm_config unchanged`,
      );
      continue;
    }
    if (flag === 0) { continue; }

    const existing = row.gm_config ? parseTemplateGmConfig(row.gm_config,) : {};
    const next = { ...existing, renderingOverride: "visual_novel", };
    const serialized = safeJsonStringify(next,);
    if (!serialized.ok) { continue; }
    await sql`
      UPDATE chat_setup_templates
         SET gm_config = ${serialized.value}
       WHERE id = ${row.id}
    `.execute(database,);
  }

  // 2. Drop the column. SQLite supports one DROP COLUMN per alterTable.
  await database.schema
    .alterTable("chat_setup_templates",)
    .dropColumn("visual_novel",)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  // Re-create the column. Down only restores the shape; the prior 0/1 state
  // is lost (it was an artifact of a deprecated field, now expressed as
  // gm_config.renderingOverride).
  await database.schema
    .alterTable("chat_setup_templates",)
    .addColumn("visual_novel", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  // Re-derive visual_novel from any gm_config.renderingOverride="visual_novel".
  await sql`
    UPDATE chat_setup_templates
       SET visual_novel = 1
     WHERE gm_config IS NOT NULL
       AND json_extract(gm_config, '$.renderingOverride') = 'visual_novel'
  `.execute(database,);
}

/**
 * @param raw
 */
function parseTemplateGmConfig(raw: string,): Record<string, unknown> {
  const parsed = safeJsonParse<Record<string, unknown>>(raw,);
  if (parsed.ok && parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value,)) {
    return parsed.value;
  }
  return {};
}
