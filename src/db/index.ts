import { Kysely, SqliteDialect } from "kysely";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DB } from "./schema";

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
function createDialect(databasePath: string): SqliteDialect {
  const sqlite = new Database(databasePath);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  const wrapped: BunSqliteWrapper = {
    close() {
      sqlite.close();
    },
    prepare: (sql: string) => {
      const statement = sqlite.prepare(sql);
      return {
        get reader() {
          const s = sql.trim().toUpperCase();
          return s.startsWith("SELECT") || s.startsWith("WITH") || s.startsWith("PRAGMA");
        },
        // The `as any[]` cast is required: Bun's SQLite typing narrows `unknown[]`
        // to `SQLQueryBindings[]` which doesn't accept readonly unknown params
        // from Kysely's dialect interface.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        all: (parameters: readonly unknown[]) => statement.all(...(parameters as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        run: (parameters: readonly unknown[]) => statement.run(...(parameters as any[])),
        iterate: function* (parameters: readonly unknown[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          yield* statement.all(...(parameters as any[]));
        },
      };
    },
  };

  return new SqliteDialect({ database: wrapped });
}

// Initialize database connection eagerly
const database: Kysely<DB> = (() => {
  const resolvedPath = path.join(process.cwd(), "..", "loop-lore-data", "loop-lore.db");
  // Ensure the parent directory exists — idempotent, safe for sibling/XDG/custom paths
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  return new Kysely<DB>({ dialect: createDialect(resolvedPath) });
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

export { type DB } from "./schema";
