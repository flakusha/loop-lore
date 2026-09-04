// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, sql, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { createLogger, getLogger, } from "../logger";
import { getDatabase, } from "./index";

/** Load schema migrations from src/db/migrations/ (filename = migration name).
 * Exported for testing — production callers should use {@link runMigrations}. */
export async function getMigrationFiles(): Promise<Record<string, Migration>> {
  const migrationsDirectory = path.join(__dirname, "migrations",);
  const matched: string[] = [];
  // Filter out colocated test files. The loader previously re-imported
  // every `*.ts` in src/db/migrations/, which means a `*.test.ts` placed
  // there would re-register its `describe()` inside whatever test held
  // the migrator, breaking the run with "Cannot call describe() inside a
  // test". Only `.ts` files that are NOT tests are migration modules.
  // BUG-migrate-ts-loader-imports-test-ts-files-from-src-db-migratio.
  for (const f of readdirSync(migrationsDirectory,)) {
    if (!f.endsWith(".ts",) || f.endsWith(".test.ts",)) { continue; }
    matched.push(f,);
  }
  const files = matched.toSorted((a, b,) => a.localeCompare(b,));
  const migrations: Record<string, Migration> = {};
  for (const file of files) {
    const module = await import(path.join(migrationsDirectory, file,));
    const name = file.replace(/\.ts$/, "",);

    migrations[name] = module.default ?? module;
  }
  return migrations;
}

/**
 * Fail-fast guard: reject databases whose applied migrations no longer exist
 * in src/db/migrations/.
 *
 * Applied migrations are append-only — deleting or renumbering a shipped
 * migration orphans its `kysely_migration` row and breaks every existing DB
 * (Kysely throws an opaque "missing migration" error with no recovery hint).
 * @param database
 * @param migrations
 * @throws {Error} When applied migrations are missing from the provider
 */
export async function assertMigrationsNotStale<DB,>(
  database: Kysely<DB>,
  migrations: Record<string, Migration>,
): Promise<void> {
  let applied: string[];
  try {
    // kysely_migration is created/managed by the Migrator via raw SQL and is
    // not part of the typed DB schema, so query it with the sql template.
    const { rows, } = await sql<{ name: string }>`select name from kysely_migration`.execute(database,);
    applied = [];
    for (const row of rows) { applied.push(row.name,); }
  } catch {
    // Fresh database — the table does not exist until the first migration runs.
    applied = [];
  }

  const missing: string[] = [];
  for (const name of applied) {
    if (!(name in migrations)) { missing.push(name,); }
  }
  missing.sort((a, b,) => a.localeCompare(b,));
  if (missing.length === 0) { return; }

  const log = getLogger().child({ module: "migrate", },);
  log.error(
    `Stale migrations detected: ${missing.length} applied migration(s) no longer exist in src/db/migrations/`,
    undefined,
    { missing, },
  );
  throw new Error(
    `Database has ${missing.length} applied migration(s) missing from src/db/migrations/:\n${
      Array.from(missing, (name,) => `  - ${name}`,).join("\n",)
    }\n\nApplied migrations are append-only: never delete or renumber a shipped migration.` +
      `\nRecovery options:` +
      `\n  1. Restore the deleted migrations from git (git show <commit>:<path>).` +
      `\n  2. If this database is disposable, recreate it (e.g. db:reinit).` +
      `\n  3. If you know the rows are truly orphaned, delete them from kysely_migration manually.`,
  );
}

/**
 * @param database
 */
export async function runMigrations(database: ReturnType<typeof getDatabase>,): Promise<void> {
  const log = getLogger().child({ module: "migrate", },);

  const migrations = await getMigrationFiles();
  await assertMigrationsNotStale(database, migrations,);

  const migrator = new Migrator({
    db: database,
    provider: {
      getMigrations: async (): Promise<Record<string, Migration>> => migrations,
    },
  },);

  const { error, results, } = await migrator.migrateToLatest();

  if (results) {
    for (const result of results) {
      log.info(`Migration ${result.migrationName}: ${result.status}`,);
    }
  }
  if (error) {
    log.error("Migration failed", error instanceof Error ? error : undefined,);
    throw new Error("Migration failed — see above",);
  }

  log.info("Database migrations completed successfully",);
}

/** */
async function migrate(): Promise<void> {
  createLogger();
  const database = getDatabase();
  await runMigrations(database,);
  await database.destroy();
}

// Run only when executed directly (bun run src/db/migrate.ts)
if (import.meta.main) {
  await migrate();
}
