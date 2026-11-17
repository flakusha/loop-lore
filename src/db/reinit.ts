// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import { existsSync, } from "node:fs";
import { loadConfig, } from "../config/load";
import { resolveDbPath, } from "../config/state-dir";
import { createLogger, getLogger, } from "../logger";
import { seedHarnessModelCapabilities, } from "../seeding";
import { createSqliteDialect, getDatabase, } from "./index";
import { runMigrations, } from "./migrate";
import { archiveFile, } from "./reinit-archive";
import type { DB, } from "./schema";
import { seedDefaultActors, } from "./seed";

/**
 * The files `db:reinit` archives before it rebuilds the database.
 *
 * Only the live database and its WAL/SHM siblings. The historical "mangled
 * path" branch (a cwd-joined absolute DATA_DIR) could never exist on disk,
 * and resolving it against DATA_DIR instead would have pointed it at ANOTHER
 * instance's database file. The repo-local legacy databases are surfaced by
 * the runtime's legacy warning (`findFirstLegacyDb`), which tells the
 * operator to copy them over — reinit never moves them.
 * @param dbPath - the live database file path
 * @returns the paths reinit archives
 */
export function reinitArchiveTargets(dbPath: string,): string[] {
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`,];
}

/** */
async function reinit(): Promise<void> {
  createLogger();
  const log = getLogger().child({ module: "reinit", },);

  const config = loadConfig();
  const dbPath = resolveDbPath(process.env, config.server,);

  log.info(`Dropping database at ${dbPath}...`,);

  // Close the eager module-level connection so file locks release
  await getDatabase(dbPath,).destroy();

  for (const p of reinitArchiveTargets(dbPath,)) {
    if (existsSync(p,)) {
      archiveFile(p, log,);
    }
  }

  log.info("Running migrations...",);
  const sqlite = new Database(dbPath,);
  sqlite.run("PRAGMA journal_mode = WAL",);
  sqlite.run("PRAGMA foreign_keys = ON",);
  const dialect = createSqliteDialect(sqlite,);
  const db = new Kysely<DB>({ dialect, },);
  await runMigrations(db,);
  await seedDefaultActors(db,);
  await seedHarnessModelCapabilities(db,);
  await db.destroy();
  log.info("Database reinitialized successfully",);
}

if (import.meta.main) {
  await reinit();
}
