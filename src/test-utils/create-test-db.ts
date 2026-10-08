// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import { createSqliteDialect, getTestDatabaseOverride, setTestDatabase, } from "../db/index";
import { runMigrations, } from "../db/migrate";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";

/**
 * Create an in-memory SQLite test database with the full schema
 * applied via migrations. Single source of truth: migrations define
 * the DB structure, tests consume it.
 * @returns Both the typed Kysely instance and raw SQLite handle
 *   (for introspection tests that need PRAGMA queries).
 */
export interface TestDb {
  db: Kysely<DB>;
  sqlite: Database;
}
/**
 * Create an in-memory SQLite DB with all migrations applied.
 * Logger is force-initialized at error level; `mock.module` stubs in
 * individual suites are responsible for additional isolation.
 * @returns `{ db, sqlite }` pair; `sqlite` is exposed for PRAGMA-level introspection tests.
 */
export async function createTestDb(): Promise<TestDb> {
  // No local pragmas — `createSqliteDialect` is the single enforcement point
  // for `PRAGMA foreign_keys = ON` (BUG-sqlite-foreign-keys-pragma-set-twice-redundant).
  const sqlite = new Database(":memory:",);
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
 * Dispose a test DB created by {@link createTestDb}.
 *
 * Explicit and opt-in on purpose: `createTestDb` is called from ~600 files,
 * ~460 of them inside `beforeAll` where one handle is shared by every test in
 * the file. Any automatic teardown keyed to the create call would close a
 * handle that sibling tests still hold, turning a silent leak into flaky
 * "database is closed" failures under parallel runners — strictly worse than
 * the leak. So the contract is spelled out here and adopted per call site.
 *
 * Safe to call twice (idempotent) so callers already closing `db`/`sqlite`
 * in their own teardown can migrate without a double-destroy throw.
 *
 * @param fixture - The `{ db, sqlite }` pair returned by `createTestDb`.
 * @returns void
 */
export async function destroyTestDb(fixture: TestDb,): Promise<void> {
  // Clear a stale global override first: if this fixture is still the
  // process-global test DB, destroying it would otherwise leave
  // `getDatabase()` handing a closed handle to every sibling file.
  // `getTestDatabaseOverride()` (not `getDatabase()`) so teardown never
  // materializes the production singleton on disk.
  if (getTestDatabaseOverride() === fixture.db) {
    setTestDatabase(null,);
  }

  // Kysely `destroy()` drains the connection pool before closing the driver,
  // so an in-flight write is flushed rather than dropped. It also closes the
  // underlying bun:sqlite handle. Repeat calls are a no-op.
  await fixture.db.destroy();
  try {
    fixture.sqlite.close();
  } catch {
    // Already closed by `db.destroy()` — nothing to do.
  }
}

/**
 * Drop all non-migration tables from the test DB.
 * Useful for tests that need a clean slate without re-running migrations.
 * @param sqlite
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
