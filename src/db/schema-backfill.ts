// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Boot-time schema backfill for pre-part databases.
 *
 * `kysely_migration` tracks `001_init` as one unit, so databases frozen
 * before a part shipped never run it. Each guard below converges one known
 * stranded case and is a cheap no-op on fresh or already-converged DBs:
 *
 * - `chat_setup_templates.visual_novel` (created by 006, dropped by the
 *   former part 017, now removed in-place): pending `visual_novel=1` flags
 *   merge into `gm_config.renderingOverride`, then the column is dropped.
 * - `memories_fts` (created broken by 016 with `content_rowid='memory_id'`,
 *   fixed in-place by removing the rowid alias and adding the sync trigger
 *   trio): broken or missing tables are rebuilt in the fixed shape with
 *   triggers, then backfilled from `actor_memories`.
 *
 * Runs after `runMigrations` in `src/server/start.ts`. Add future
 * stranded guards here following the same probe-then-repair shape.
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

const MEMORIES_FTS_TRIGGERS: readonly string[] = [
  `CREATE TRIGGER IF NOT EXISTS actor_memories_fts_ad
    AFTER DELETE ON actor_memories BEGIN
      DELETE FROM memories_fts WHERE memory_id = old.id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS actor_memories_fts_ai
    AFTER INSERT ON actor_memories BEGIN
      INSERT INTO memories_fts(memory_id, content)
      VALUES (new.id, new.content);
    END`,
  `CREATE TRIGGER IF NOT EXISTS actor_memories_fts_au
    AFTER UPDATE OF content ON actor_memories BEGIN
      DELETE FROM memories_fts WHERE memory_id = old.id;
      INSERT INTO memories_fts(memory_id, content)
      VALUES (new.id, new.content);
    END`,
];

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
 * @param database
 */
async function repairTemplateVisualNovel(database: Kysely<DB>,): Promise<boolean> {
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

/**
 * @param database
 * @param name
 */
async function tableSql(database: Kysely<DB>, name: string,): Promise<string | null> {
  const found = await sql<{ sql: string | null }>`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ${name}`
    .execute(database,);
  return found.rows[0]?.sql ?? null;
}

/**
 * Rebuild a broken or missing `memories_fts` in the fixed shape.
 *
 * The pre-fix shape declared `content_rowid='memory_id'`, which turns the
 * TEXT uuid column into a rowid alias and makes the table unqueryable; it
 * also lacked the sync triggers, so the table stayed empty. Detection is
 * the stored DDL: missing table or DDL containing `content_rowid` triggers
 * a rebuild (dropping also clears orphaned triggers), then rows backfill
 * from `actor_memories` when that table exists.
 * @param database - Migrated database handle.
 * @returns True when the table was rebuilt, false when already correct.
 */
async function repairMemoriesFts(database: Kysely<DB>,): Promise<boolean> {
  const current = await tableSql(database, "memories_fts",);
  if (current !== null && !current.includes("content_rowid",)) { return false; }
  const log = getLogger().child({ module: "schema-backfill", },);

  await database.transaction().execute(async (transaction,) => {
    await sql`DROP TABLE IF EXISTS memories_fts`.execute(transaction,);
    await sql`CREATE VIRTUAL TABLE memories_fts USING fts5(
      memory_id UNINDEXED,
      content
    )`.execute(transaction,);
    // CREATE TRIGGER requires the subject table: pre-012 databases have no
    // actor_memories, so the table is rebuilt bare and stays triggerless.
    if ((await tableSql(transaction, "actor_memories",)) === null) {
      log.warn("actor_memories absent; memories_fts rebuilt without sync triggers",);
      return;
    }
    for (const trigger of MEMORIES_FTS_TRIGGERS) {
      await sql.raw(trigger,).execute(transaction,);
    }
    await sql`INSERT INTO memories_fts(memory_id, content)
      SELECT id, content FROM actor_memories`.execute(transaction,);
  },);

  log.info("Schema backfill applied: memories_fts rebuilt in fixed shape with sync triggers",);
  return true;
}

/**
 * Converge all stranded schema cases. Idempotent: converged databases
 * return false without touching rows.
 * @param database - Migrated database handle.
 * @returns True when any repair ran, false when there was nothing to do.
 * @example
 * await runMigrations(database);
 * await runSchemaBackfill(database);
 */
export async function runSchemaBackfill(database: Kysely<DB>,): Promise<boolean> {
  const template = await repairTemplateVisualNovel(database,);
  const fts = await repairMemoriesFts(database,);
  return template || fts;
}
