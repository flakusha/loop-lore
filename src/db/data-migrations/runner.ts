// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import type { DataMigration, } from "./types";

/**
 * @param db
 * @param table
 * @param toVersion
 * @returns string
 */
async function isApplied(db: Kysely<DB>, table: string, toVersion: number,): Promise<boolean> {
  const row = await db
    .selectFrom("data_migrations",)
    .select("table_name",)
    .where("table_name", "=", table,)
    .where("to_version", "=", toVersion,)
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * @param db
 * @param migration
 * @returns void
 */
async function markApplied(db: Kysely<DB>, migration: DataMigration,): Promise<void> {
  await db
    .insertInto("data_migrations",)
    .values({
      table_name: migration.table,
      from_version: migration.fromVersion,
      to_version: migration.toVersion,
      description: migration.description,
    },)
    .execute();
}

/** Recognized data-migration file shape: `v<N>_description.ts`. */
const DATA_MIGRATION_FILE = /^v(\d+)_/;

/**
 * Numeric-aware ordering for `v<N>_*.ts` data-migration files. Mirrors
 * `compareMigrationNames` in src/db/migrate.ts: `localeCompare` is
 * locale-dependent and sorts `v10_` before `v2_`, silently reordering
 * migrations.
 * @param a
 * @param b
 */
function compareVersionNames(a: string, b: string,): number {
  const an = Number(a.match(DATA_MIGRATION_FILE,)?.[1] ?? Number.NaN,);
  const bn = Number(b.match(DATA_MIGRATION_FILE,)?.[1] ?? Number.NaN,);
  if (!Number.isNaN(an,) && !Number.isNaN(bn,) && an !== bn) { return an - bn; }
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Discover and import data migrations colocated next to this runner.
 * Exported for testing — production callers use {@link runDataMigrations}.
 * @param baseDir - Directory scanned for `<table>/v<N>_*.ts` migrations.
 * @returns array of `DataMigration` definitions (sorted by version number).
 */
export async function discoverMigrations(baseDir: string = __dirname,): Promise<DataMigration[]> {
  const log = getLogger().child({ module: "data-migrations", },);
  const tasks: DataMigration[] = [];
  const { readdirSync, statSync, } = await import("node:fs");
  const path = await import("node:path");

  // Locale-independent lexicographic ordering for table directories.
  const entries = readdirSync(baseDir,).toSorted((a, b,) => (a < b ? -1 : a > b ? 1 : 0));
  for (const entry of entries) {
    const dirPath = path.join(baseDir, entry,);
    if (!statSync(dirPath,).isDirectory()) { continue; }

    const matched: string[] = [];
    for (const f of readdirSync(dirPath,)) {
      if (f.startsWith("v",) && f.endsWith(".ts",)) { matched.push(f,); }
    }
    const files = matched.toSorted(compareVersionNames,);

    for (const file of files) {
      const mod = await import(path.join(dirPath, file,));
      if (mod.migration) {
        tasks.push(mod.migration as DataMigration,);
      } else {
        // A typo'd export must not vanish silently.
        log.warn(`Data migration file exports no \`migration\` — skipped: ${path.join(dirPath, file,)}`,);
      }
    }
  }

  return tasks;
}

/**
 * Apply one data migration atomically.
 *
 * The check, transform, and record all run in a single transaction:
 *   - a crash/failure mid-way rolls back both the transform and the record,
 *     so the migration stays unapplied and re-runs safely;
 *   - the isApplied re-check inside the same transaction closes the TOCTOU
 *     window between concurrent runners (SQLite serializes writers; the
 *     (table_name, to_version) PK rejects duplicate records).
 * @param db
 * @param migration
 * @returns true when the migration was applied, false when already applied
 */
export async function applyDataMigration(
  db: Kysely<DB>,
  migration: DataMigration,
): Promise<boolean> {
  return db.transaction().execute(async (trx,) => {
    const alreadyDone = await isApplied(trx, migration.table, migration.toVersion,);
    if (alreadyDone) { return false; }

    await migration.up(trx,);
    await markApplied(trx, migration,);
    return true;
  },);
}

/**
 * @param db
 * @param logProgress
 * @returns void
 */
export async function runDataMigrations(db: Kysely<DB>, logProgress = true,): Promise<void> {
  const log = getLogger().child({ module: "data-migrations", },);

  const migrations = await discoverMigrations();

  let applied = 0;
  for (const migration of migrations) {
    const didApply = await applyDataMigration(db, migration,);
    if (!didApply) { continue; }

    if (logProgress) {
      log.info(`Data migration applied: ${migration.table} v${migration.fromVersion} → v${migration.toVersion}`, {
        description: migration.description,
      },);
    }
    applied++;
  }

  if (logProgress) {
    if (applied === 0) {
      log.info("All data migrations already applied",);
    } else {
      log.info(`${applied} data migration(s) applied`,);
    }
  }
}
