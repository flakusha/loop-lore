// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, type SQLQueryBindings, } from "bun:sqlite";
import { Kysely, SqliteDialect, } from "kysely";
import fs from "node:fs";
import path from "node:path";
import { findLegacyDb, LEGACY_DATA_DIR, resolveDbPath, } from "../config/state-dir";
import type { DB, } from "./schema";

interface BunSqliteStatement {
  reader: boolean;
  all(parameters: readonly unknown[],): unknown[];
  run(parameters: readonly unknown[],): { changes: number | bigint; lastInsertRowid: number | bigint };
  iterate(parameters: readonly unknown[],): IterableIterator<unknown>;
}

interface BunSqliteWrapper {
  close(): void;
  prepare(sql: string,): BunSqliteStatement;
}

// Wraps bun:sqlite to match the interface Kysely's SqliteDialect expects.
/**
 * Kysely hands bindings as `readonly unknown[]`; bun:sqlite accepts only its
 * `SQLQueryBindings` union, which `unknown` cannot be narrowed to structurally.
 * One named boundary conversion, instead of an `as any[]` cast per call site
 * (BUG-route-and-bootstrap-boundaries-use-raw-as-any-casts-instead-).
 * @param parameters - Bindings as Kysely supplies them
 * @returns The same bindings typed for bun:sqlite
 */
function asBindings(parameters: readonly unknown[],): SQLQueryBindings[] {
  return parameters as SQLQueryBindings[];
}

/**
 * @param database
 * @returns Database
 */
export function createSqliteDialect(database: Database,): SqliteDialect {
  // Always enforce WAL + foreign keys on the underlying connection, whether
  // the caller passed a fresh file path or an existing Database. Skipping
  // these on the existing-Database path silently disables FK enforcement
  // (BUG-sqlite-pragmas-skipped-when-dialect-built-from-existing-data).
  database.run("PRAGMA journal_mode = WAL",);
  database.run("PRAGMA foreign_keys = ON",);
  database.run("PRAGMA busy_timeout = 5000",);

  const wrapped: BunSqliteWrapper = {
    /**
     * @returns {void}
     */
    close() {
      database.close();
    },
    prepare: (sql: string,) => {
      const statement = database.prepare(sql,);
      return {
        // Kysely's SqliteConnection (kysely/dist/dialect/sqlite/sqlite-driver.js:59)
        // branches on this flag: readers go through all() and keep their rows, writers
        // go through run() and get rows: []. A statement yields rows iff SQLite gave it
        // result columns, so ask SQLite instead of matching SQL text — `INSERT ...
        // RETURNING` and `UPDATE ... RETURNING` have columns, while `INSERT` of a value
        // containing the word "returning" does not. No substring test can tell those.
        get reader() {
          return statement.columnNames.length > 0;
        },

        all: (parameters: readonly unknown[],) => statement.all(...asBindings(parameters,),),

        run: (parameters: readonly unknown[],) => statement.run(...asBindings(parameters,),),
        iterate: function*(parameters: readonly unknown[],) {
          yield* statement.all(...asBindings(parameters,),);
        },
      };
    },
  };

  return new SqliteDialect({ database: wrapped, },);
}

/** Test override — set by setTestDatabase(). When set, getDatabase() returns this instead. */
let testDatabaseOverride: Kysely<DB> | null = null;

/** Raw handle behind the test override, when the caller could provide it. */
let testOverrideSqlite: Database | null = null;

/**
 * Override the global database instance for testing.
 *
 * Process-global under non-isolated runners; tests MUST clear it (`setTestDatabase(null)`)
 * in `afterAll`/`finally` so a thrown assertion cannot leak the override into sibling files.
 * Bun's `--isolate` is best-effort — see BUG-settestdatabase-global-leak-on-test-throw.
 *
 * Pass null to clear the override.
 * @param db - the override Kysely handle, or null to clear
 * @param sqlite - raw handle behind `db`, when the fixture owns one (lets
 *   consumers like quota storage bind the SAME database the override routes to)
 */
export function setTestDatabase(db: Kysely<DB> | null, sqlite?: Database,): void {
  testDatabaseOverride = db;
  testOverrideSqlite = db ? sqlite ?? null : null;
}

/**
 * Read the current test override WITHOUT materializing the production
 * singleton. Unlike `getDatabase()`, this never touches disk — safe to call
 * from teardown paths that only want to know whether an override is set.
 * @returns The override Kysely handle, or null when none is set.
 */
export function getTestDatabaseOverride(): Kysely<DB> | null {
  return testDatabaseOverride;
}

// Lazy production singleton — only created on the first getDatabase() call when no test
// override is in effect. Eager initialization at module load forced every test that imports
// `@/db` to materialize a repo-local loop-lore.db (see BUG-eager-db-init-creates-on-disk-db-on-test-import).
let database: Kysely<DB> | null = null;

/** Raw handle behind the production singleton (null until it materializes). */
let singletonSqlite: Database | null = null;

/** Filesystem path the production singleton was opened on (null until it materializes). */
let singletonPath: string | null = null;

/** Legacy-repo-data warning fires at most once per process. */
let legacyMigrationWarned = false;

/**
 * The raw `bun:sqlite` handle behind the CURRENT getDatabase() resolution —
 * the test override's handle when an override is active (never falling
 * through to the production singleton, so consumers read the same database
 * queries hit), otherwise the singleton's once materialized.
 * Never creates anything: null means "no DB is available" and callers keep
 * their non-DB fallback (preserving BUG-eager-db-init-creates-on-disk-db-on-test-import).
 * @returns the active raw handle, or null when none is materialized
 */
export function getSqliteDatabase(): Database | null {
  if (testDatabaseOverride) { return testOverrideSqlite; }
  return singletonSqlite;
}

/**
 * Point the operator at a legacy repo-local database once per process.
 * Docs-only migration: never moves anything, just prints the exact `cp -a`.
 * @param dbPath - the resolved live path about to be opened
 */
function warnOnLegacyData(dbPath: string,): void {
  if (legacyMigrationWarned) {
    return;
  }

  legacyMigrationWarned = true;
  const legacyDb = findLegacyDb(LEGACY_DATA_DIR, dbPath,);
  if (!legacyDb) {
    return;
  }

  // console, not the app logger: this fires before logging is initialized
  // (getDatabase runs during boot and in logger-less tests).
  // eslint-disable-next-line no-console
  console.warn(
    `[loop-lore] Legacy repo-local database found at ${legacyDb} — runtime state now lives under the XDG state dir (${dbPath}). ` +
      `Move it with: cp -a ${legacyDb} ${dbPath} (then remove the legacy copy). No auto-migration is performed.`,
  );
}

/**
 * Precedence: explicit `databasePath` arg > LOOP_LORE_DB_PATH > XDG
 * per-instance default. The config-file `db.sqliteFilename` knob is IGNORED
 * (runtime never read it — see docs/spec/xdg-state-storage.md).
 *
 * Fails loud when the resolved path changes under a live singleton: silently
 * serving the previous instance's database is exactly the multi-writer
 * hazard per-instance dirs exist to prevent.
 * @param databasePath - explicit path, wins over env and the XDG default
 * @returns the Kysely DB handle (test override if set, otherwise the lazily-initialized singleton).
 * @throws when the resolved path differs from the live singleton's path
 */
export function getDatabase(databasePath?: string,): Kysely<DB> {
  if (testDatabaseOverride) {
    return testDatabaseOverride;
  }

  const dbPath = databasePath ?? resolveDbPath();
  if (database) {
    if (singletonPath !== dbPath) {
      throw new Error(
        `getDatabase() resolved a different path under a live singleton (open: ${singletonPath}, requested: ${dbPath}). ` +
          "Two instances must never share one process — call resetDatabaseSingleton() first (tests) or run separate processes (prod).",
      );
    }

    return database;
  }

  warnOnLegacyData(dbPath,);
  // Ensure the parent directory exists — idempotent, safe for sibling/XDG/custom paths
  fs.mkdirSync(path.dirname(dbPath,), { recursive: true, },);
  const sqlite = new Database(dbPath,);
  singletonSqlite = sqlite;
  singletonPath = dbPath;
  database = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);

  return database;
}

/**
 * Tear the lazily-created production singleton down and restore the
 * pre-materialization state, so the NEXT getDatabase() call opens whatever
 * path is current. Tests call this to stop module state leaking into sibling
 * files: destroying the Kysely handle alone leaves `singletonSqlite` bound to
 * a deleted probe DB, and every later DB-backed consumer then fails with
 * "no such table".
 * @returns resolves once the Kysely handle is destroyed
 */
export async function resetDatabaseSingleton(): Promise<void> {
  const current = database;
  database = null;
  singletonSqlite = null;
  singletonPath = null;
  if (current) { await current.destroy(); }
}

/** */
export type Db = Kysely<DB>;

export { type DB, } from "./schema";
export { SCHEMA, SchemaManifest, type TableName, } from "./schema-manifest";
