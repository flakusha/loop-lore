// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, type SQLQueryBindings, } from "bun:sqlite";
import { Kysely, SqliteDialect, } from "kysely";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, } from "../config/constants";
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
// `@/db` to materialize `loop-lore-data/loop-lore.db` (see BUG-eager-db-init-creates-on-disk-db-on-test-import).
let database: Kysely<DB> | null = null;

/** Raw handle behind the production singleton (null until it materializes). */
let singletonSqlite: Database | null = null;

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
 * @param _databasePath - path is unused when a test override is set; resolution falls back to the singleton DB otherwise.
 * @returns the Kysely DB handle (test override if set, otherwise the lazily-initialized singleton).
 */
export function getDatabase(_databasePath?: string,): Kysely<DB> {
  if (testDatabaseOverride) { return testDatabaseOverride; }
  if (!database) {
    const dbPath = process.env.LOOP_LORE_DB_PATH ?? path.resolve(DATA_DIR, "loop-lore.db",);
    // Ensure the parent directory exists — idempotent, safe for sibling/XDG/custom paths
    fs.mkdirSync(path.dirname(dbPath,), { recursive: true, },);
    const sqlite = new Database(dbPath,);
    singletonSqlite = sqlite;
    database = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
  }

  return database;
}

/** */
export type Db = Kysely<DB>;

export { type DB, } from "./schema";
export { SCHEMA, SchemaManifest, type TableName, } from "./schema-manifest";
