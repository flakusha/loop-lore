// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "../db/index";
import { runMigrations, } from "../db/migrate";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";

/**
 * Create an in-memory SQLite test database with the full schema
 * applied via migrations. Single source of truth: migrations define
 * the DB structure, tests consume it.
 *
 * @returns Both the typed Kysely instance and raw SQLite handle
 *   (for introspection tests that need PRAGMA queries).
 */
export interface TestDb {
  db: Kysely<DB>;
  sqlite: Database;
}
export async function createTestDb(): Promise<TestDb> {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = ON",);
  const dialect = createSqliteDialect(sqlite,);
  const db = new Kysely<DB>({ dialect, },);

  // Ensure logger is available (runMigrations calls getLogger())
  try {
    createLogger({ level: "error", },);
  } catch {
    // Logger already initialized — ignore
  }

  await runMigrations(db,);

  return { db, sqlite, };
}

/**
 * Drop all non-migration tables from the test DB.
 * Useful for tests that need a clean slate without re-running migrations.
 */
export function resetTestDb(sqlite: Database,): void {
  // Temporarily disable FK constraints so we can delete in any order
  sqlite.run("PRAGMA foreign_keys = OFF",);
  const tables = sqlite
    .query(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'kysely_%'
         AND name NOT LIKE '%_fts%'`,
    )
    .all() as { name: string }[];
  for (const { name, } of tables) {
    sqlite.run(`DELETE FROM "${name}"`,);
  }
  sqlite.run("PRAGMA foreign_keys = ON",);
}
