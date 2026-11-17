// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, sql, } from "kysely";
import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { loadConfig, } from "../config/load";
import { resolveDbPath, } from "../config/state-dir";
import { createLogger, getLogger, } from "../logger";
import { getDatabase, } from "./index";

// Re-exported so boot code (src/server/start.ts) imports both migration
// phases from one module and stays under the file-size gate.
export { runDataMigrations, } from "./data-migrations/runner";

/**
 * Migration filename regex — three-digit numeric prefix then `_` then name.
 * Stray files (README.md, dotfiles, helpers) are filtered out so they
 * cannot accidentally register as a migration. BUG-migration-ordering-
 * ambiguous-via-localecompare-duplicate-num.
 */
const MIGRATION_FILENAME = /^(\d{3})_(.+)\.ts$/;

/**
 * Extract the leading numeric prefix from a migration filename, or NaN
 * when the file is not a recognized migration (filtered earlier).
 * @param name
 */
function migrationPrefix(name: string,): number {
  const match = name.match(MIGRATION_FILENAME,);
  return match ? Number(match[1],) : Number.NaN;
}

/**
 * Numeric-aware comparator: order by leading NNN prefix, then
 * alphabetically for ties. Replaces `localeCompare`, which was
 * locale-dependent (Turkish locale broke ordering of `011_*` vs `010_*`)
 * and gave no guarantee for files with the same prefix (e.g. `041a_` vs
 * `041b_`). BUG-migration-ordering-ambiguous-via-localecompare.
 * @param a
 * @param b
 * @returns {number}
 */
export function compareMigrationNames(a: string, b: string,): number {
  const an = migrationPrefix(a,);
  const bn = migrationPrefix(b,);
  if (!Number.isNaN(an,) && !Number.isNaN(bn,)) {
    if (an !== bn) { return an - bn; }
  } else if (!Number.isNaN(an,)) { return -1; }
  else if (!Number.isNaN(bn,)) { return 1; }

  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Load schema migrations from src/db/migrations/ (filename = migration name).
 * Exported for testing — production callers should use {@link runMigrations}.
 * @returns map of migration name → `Migration` instance, in declared order.
 */
export async function getMigrationFiles(): Promise<Record<string, Migration>> {
  const migrationsDirectory = path.join(__dirname, "migrations",);
  const matched: string[] = [];
  // Filter: only `NNN_name.ts` (three-digit numeric prefix) registration
  // files. Stray `.ts` (helpers, README siblings, `.test.ts` colocated)
  // would otherwise register as migrations. Two filters stacked:
  //   1. Strict `NNN_name.ts` shape excludes README, helpers, tests.
  //   2. Numeric comparator below guarantees deterministic order across
  //      locales (replaces the previous `localeCompare`).
  for (const f of readdirSync(migrationsDirectory,)) {
    if (!MIGRATION_FILENAME.test(f,)) { continue; }
    matched.push(f,);
  }

  const files = matched.toSorted(compareMigrationNames,);
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
 * @returns void
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
  } catch (error) {
    // Fresh database — the table does not exist until the first migration runs.
    // Any OTHER failure (locked DB, I/O error, permissions) must not be
    // mistaken for "nothing applied": that would silently skip this guard.
    if (!(error instanceof Error) || !error.message.includes("no such table",)) {
      throw error;
    }

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
 * Bounded time a boot waits for another process's migration run before
 * failing loud. Matches the per-connection default in createSqliteDialect —
 * set explicitly here so runMigrations never inherits an unbounded (or
 * foreign) busy timeout from a caller-built handle.
 */
const MIGRATION_BUSY_TIMEOUT_MS = 5000;

/**
 * Best-effort filesystem path of the database behind this handle, for
 * contention errors. `PRAGMA database_list` is connection-local and takes no
 * locks, so it stays readable while another process holds the write lock.
 * @param database
 * @returns the `main` database file, or "(unknown)" when it cannot be read
 */
async function describeDatabaseFile<DB,>(database: Kysely<DB>,): Promise<string> {
  try {
    const { rows, } = await sql<{ name: string; file: string }>`PRAGMA database_list`.execute(database,);
    const main = rows.find((row,) => row.name === "main");
    if (main?.file) { return main.file; }
  } catch {
    // Fall through — the path is diagnostic, never load-bearing.
  }

  return "(unknown)";
}

/**
 * @param database
 * @returns void
 * @throws {Error}
 */
export async function runMigrations(database: ReturnType<typeof getDatabase>,): Promise<void> {
  const log = getLogger().child({ module: "migrate", },);

  const migrations = await getMigrationFiles();
  await assertMigrationsNotStale(database, migrations,);

  // Cross-process guard (BUG-concurrent-migrations-race-on-a-shared-sqlite-file):
  // the Kysely Migrator takes no SQLite lock of its own (SqliteAdapter's
  // acquireMigrationLock is a no-op and it runs migration DDL without a
  // transaction), so two processes sharing one file would both read the same
  // kysely_migration state and apply the same DDL. BEGIN IMMEDIATE takes the
  // RESERVED lock up front: a second process either waits for the first
  // (bounded by the busy timeout, then sees the first's rows and applies
  // nothing) or fails loud below. No shipped migration opens its own
  // transaction (only trigger bodies contain BEGIN), so nothing inside can
  // prematurely close this transaction.
  await sql.raw(`PRAGMA busy_timeout = ${MIGRATION_BUSY_TIMEOUT_MS}`,).execute(database,);
  const dbPath = await describeDatabaseFile(database,);
  try {
    await sql.raw("BEGIN IMMEDIATE",).execute(database,);
  } catch (error) {
    if (!(error instanceof Error) || !/database is locked|SQLITE_BUSY/i.test(error.message,)) { throw error; }
    throw new Error(
      `Migration lock contention on ${dbPath}: another process is migrating this database. ` +
        `Wait for it to finish, then retry (BEGIN IMMEDIATE timed out after ${MIGRATION_BUSY_TIMEOUT_MS}ms).`,
      { cause: error, },
    );
  }

  try {
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
      throw new Error("Migration failed — see above", { cause: error, },);
    }

    await sql.raw("COMMIT",).execute(database,);
  } catch (error) {
    try {
      await sql.raw("ROLLBACK",).execute(database,);
    } catch {
      // Best-effort release: the connection may already be out of the
      // transaction (e.g. COMMIT itself failed). Never mask the original error.
    }

    throw error;
  }

  log.info("Database migrations completed successfully",);
}

/** */
async function migrate(): Promise<void> {
  createLogger();
  const config = loadConfig();
  const database = getDatabase(resolveDbPath(process.env, config.server,),);
  await runMigrations(database,);
  await database.destroy();
}

// Run only when executed directly (bun run src/db/migrate.ts)
if (import.meta.main) {
  await migrate();
}
