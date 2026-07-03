import { Kysely, SqliteDialect } from "kysely";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { DB } from "./schema";

interface BunSqliteStatement {
  reader: boolean;
  all(params: readonly unknown[]): unknown[];
  run(params: readonly unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  iterate(params: readonly unknown[]): IterableIterator<unknown>;
}

interface BunSqliteWrapper {
  close(): void;
  prepare(sql: string): BunSqliteStatement;
}

// Wraps bun:sqlite to match the interface Kysely's SqliteDialect expects.
// The `any` casts are required because Bun's SQLite accepts a wide union of binding types
// that can't be expressed in Kysely's `readonly unknown[]` parameter signature.
function createDialect(dbPath: string): SqliteDialect {
  const sqlite = new Database(dbPath);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");

  const wrapped: BunSqliteWrapper = {
    close() {
      sqlite.close();
    },
    prepare: (sql: string) => {
      const stmt = sqlite.prepare(sql);
      return {
        get reader() {
          const s = sql.trim().toUpperCase();
          return s.startsWith("SELECT") || s.startsWith("WITH") || s.startsWith("PRAGMA");
        },
        // The `as any[]` cast is required: Bun's SQLite typing narrows `unknown[]`
        // to `SQLQueryBindings[]` which doesn't accept readonly unknown params
        // from Kysely's dialect interface.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        all: (params: readonly unknown[]) => stmt.all(...(params as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        run: (params: readonly unknown[]) => stmt.run(...(params as any[])),
        iterate: function* (params: readonly unknown[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
          yield* stmt.all(...(params as any[]));
        },
      };
    },
  };

  return new SqliteDialect({ database: wrapped });
}

let db: Kysely<DB> | null = null;

export function getDb(dbPath?: string): Kysely<DB> {
  if (!db) {
    const resolvedPath = dbPath ?? path.join(process.cwd(), "..", "loop-lore-data", "loop-lore.db");
    // Ensure the parent directory exists — idempotent, safe for sibling/XDG/custom paths
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    db = new Kysely<DB>({ dialect: createDialect(resolvedPath) });
  }
  return db;
}

export { type DB } from "./schema";
