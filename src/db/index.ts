import { Kysely, SqliteDialect } from "kysely";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DB } from "./schema";
import { DATA_DIR } from "../config/constants";

interface BunSqliteStatement {
  reader: boolean;
  all(parameters: readonly unknown[]): unknown[];
  run(parameters: readonly unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  iterate(parameters: readonly unknown[]): IterableIterator<unknown>;
}

interface BunSqliteWrapper {
  close(): void;
  prepare(sql: string): BunSqliteStatement;
}

// Wraps bun:sqlite to match the interface Kysely's SqliteDialect expects.
// The `any` casts are required because Bun's SQLite accepts a wide union of binding types
// that can't be expressed in Kysely's `readonly unknown[]` parameter signature.
export function createSqliteDialect(database: Database): SqliteDialect {
  const wrapped: BunSqliteWrapper = {
    close() {
      database.close();
    },
    prepare: (sql: string) => {
      const statement = database.prepare(sql);
      return {
        get reader() {
          const s = sql.trim().toUpperCase();
          return s.startsWith("SELECT") || s.startsWith("WITH") || s.startsWith("PRAGMA");
        },

        all: (parameters: readonly unknown[]) => statement.all(...(parameters as any[])),

        run: (parameters: readonly unknown[]) => statement.run(...(parameters as any[])),
        iterate: function* (parameters: readonly unknown[]) {
          yield* statement.all(...(parameters as any[]));
        },
      };
    },
  };

  return new SqliteDialect({ database: wrapped });
}

function createDialect(databasePath: string): SqliteDialect {
  const sqlite = new Database(databasePath);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  return createSqliteDialect(sqlite);
}

// Initialize database connection eagerly
const database: Kysely<DB> = (() => {
  const dbPath = process.env.LOOP_LORE_DB_PATH ?? path.resolve(DATA_DIR, "loop-lore.db");
  // Ensure the parent directory exists — idempotent, safe for sibling/XDG/custom paths
  mkdirSync(path.dirname(dbPath), { recursive: true });
  return new Kysely<DB>({ dialect: createDialect(dbPath) });
})();

/** Test override — set by setTestDatabase(). When set, getDatabase() returns this instead. */
let testDatabaseOverride: Kysely<DB> | null = null;

/**
 * Override the global database instance for testing.
 * Pass null to clear the override.
 */
export function setTestDatabase(db: Kysely<DB> | null): void {
  testDatabaseOverride = db;
}

export function getDatabase(_databasePath?: string): Kysely<DB> {
  return testDatabaseOverride ?? database;
}

export type Db = Kysely<DB>;

export { type DB } from "./schema";
export { SCHEMA, SchemaManifest, type TableName } from "./schema-manifest";
