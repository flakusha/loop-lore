// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { Kysely, SqliteDialect, } from "kysely";
import { mkdirSync, } from "node:fs";
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
// The `any` casts are required because Bun's SQLite accepts a wide union of binding types
// that can't be expressed in Kysely's `readonly unknown[]` parameter signature.
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
    close() {
      database.close();
    },
    prepare: (sql: string,) => {
      const statement = database.prepare(sql,);
      return {
        get reader() {
          const s = sql.trim().toUpperCase();
          return s.startsWith("SELECT",) || s.startsWith("WITH",) || s.startsWith("PRAGMA",);
        },

        all: (parameters: readonly unknown[],) => statement.all(...(parameters as any[]),),

        run: (parameters: readonly unknown[],) => statement.run(...(parameters as any[]),),
        iterate: function*(parameters: readonly unknown[],) {
          yield* statement.all(...(parameters as any[]),);
        },
      };
    },
  };

  return new SqliteDialect({ database: wrapped, },);
}

/**
 * @param databasePath
 * @returns void
 */
function createDialect(databasePath: string,): SqliteDialect {
  // Pragmas are applied inside createSqliteDialect so both paths are enforced.
  return createSqliteDialect(new Database(databasePath,),);
}

/** Test override — set by setTestDatabase(). When set, getDatabase() returns this instead. */
let testDatabaseOverride: Kysely<DB> | null = null;

/**
 * Override the global database instance for testing.
 *
 * Process-global under non-isolated runners; tests MUST clear it (`setTestDatabase(null)`)
 * in `afterAll`/`finally` so a thrown assertion cannot leak the override into sibling files.
 * Bun's `--isolate` is best-effort — see BUG-settestdatabase-global-leak-on-test-throw.
 *
 * Pass null to clear the override.
 * @param db
 * @returns void
 */
export function setTestDatabase(db: Kysely<DB> | null,): void {
  testDatabaseOverride = db;
}

// Lazy production singleton — only created on the first getDatabase() call when no test
// override is in effect. Eager initialization at module load forced every test that imports
// `@/db` to materialize `loop-lore-data/loop-lore.db` (see BUG-eager-db-init-creates-on-disk-db-on-test-import).
let database: Kysely<DB> | null = null;

/**
 * @param _databasePath - path is unused when a test override is set; resolution falls back to the singleton DB otherwise.
 * @returns the Kysely DB handle (test override if set, otherwise the lazily-initialized singleton).
 */
export function getDatabase(_databasePath?: string,): Kysely<DB> {
  if (testDatabaseOverride) { return testDatabaseOverride; }
  if (!database) {
    const dbPath = process.env.LOOP_LORE_DB_PATH ?? path.resolve(DATA_DIR, "loop-lore.db",);
    // Ensure the parent directory exists — idempotent, safe for sibling/XDG/custom paths
    mkdirSync(path.dirname(dbPath,), { recursive: true, },);
    database = new Kysely<DB>({ dialect: createDialect(dbPath,), },);
  }
  return database;
}

/** */
export type Db = Kysely<DB>;

export { type DB, } from "./schema";
export { SCHEMA, SchemaManifest, type TableName, } from "./schema-manifest";
