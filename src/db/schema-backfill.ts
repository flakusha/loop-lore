// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Boot-time schema backfill for pre-part databases.
 *
 * `kysely_migration` tracks `001_init` as one unit, so databases frozen
 * before a part shipped never run it. This guard converges the one known
 * stranded case: `chat_setup_templates.visual_novel` (created by 006,
 * dropped by the former part 017, now removed in-place). When the column
 * is present, pending `visual_novel=1` flags are merged into
 * `gm_config.renderingOverride` and the column is dropped — the exact
 * transform 017 applied. Column absent (fresh or already-converged DBs)
 * is a cheap no-op.
 *
 * Runs after `runMigrations` in `src/server/start.ts`. Add future
 * stranded-column guards here following the same probe-then-repair shape.
 * @module schema-backfill
 */
import { safeJsonParse, safeJsonStringify, } from "@/utils/safe-json";
import { type Kysely, sql, } from "kysely";
import { getLogger, } from "../logger";
import type { DB, } from "./schema";

interface LegacyTemplateRow {
  id: string;
  gm_config: string | null;
  visual_novel: number | null;
}

/**
 * @param database
 */
async function hasVisualNovelColumn(database: Kysely<DB>,): Promise<boolean> {
  const columns = await sql<{ name: string }>`SELECT name FROM pragma_table_info('chat_setup_templates')`.execute(
    database,
  );
  return columns.rows.some((row,) => row.name === "visual_novel");
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

/**
 * Converge stranded `visual_novel` flags, then drop the column.
 * Idempotent: column-absent databases return false without touching rows.
 * @param database - Migrated database handle.
 * @returns True when the backfill ran, false when there was nothing to do.
 * @example
 * await runMigrations(database);
 * await runSchemaBackfill(database);
 */
export async function runSchemaBackfill(database: Kysely<DB>,): Promise<boolean> {
  if (!(await hasVisualNovelColumn(database,))) { return false; }
  const log = getLogger().child({ module: "schema-backfill", },);

  await database.transaction().execute(async (transaction,) => {
    const pending = await sql<LegacyTemplateRow>`
      SELECT id, gm_config, visual_novel
        FROM chat_setup_templates
       WHERE visual_novel IS NOT NULL
    `.execute(transaction,);

    for (const row of pending.rows) {
      const flag = Number(row.visual_novel,);
      if (!Number.isFinite(flag,) || (flag !== 0 && flag !== 1)) {
        log.warn(`template ${row.id} had unexpected visual_novel=${row.visual_novel}; leaving gm_config unchanged`,);
        continue;
      }
      if (flag === 0) { continue; }

      const merged = { ...parseTemplateGmConfig(row.gm_config ?? "",), renderingOverride: "visual_novel", };
      const serialized = safeJsonStringify(merged,);
      if (!serialized.ok) { continue; }
      await sql`
        UPDATE chat_setup_templates
           SET gm_config = ${serialized.value}
         WHERE id = ${row.id}
      `.execute(transaction,);
    }

    await sql`ALTER TABLE chat_setup_templates DROP COLUMN visual_novel`.execute(transaction,);
  },);

  log.info("Schema backfill applied: chat_setup_templates.visual_novel converged and dropped",);
  return true;
}
