// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import { existsSync, } from "node:fs";
import path from "node:path";
import { DATA_DIR, } from "../config/constants";
import { resolveDbPath, } from "../config/state-dir";
import { createLogger, getLogger, } from "../logger";
import { seedHarnessModelCapabilities, } from "../seeding";
import { createSqliteDialect, getDatabase, } from "./index";
import { runMigrations, } from "./migrate";
import { archiveFile, } from "./reinit-archive";
import type { DB, } from "./schema";
import { seedDefaultActors, } from "./seed";

/** */
async function reinit(): Promise<void> {
  createLogger();
  const log = getLogger().child({ module: "reinit", },);

  const dbPath = resolveDbPath();
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;

  // Clean up old mangled path (pre-fix: path.join with absolute DATA_DIR)
  const oldPath = path.join(process.cwd(), DATA_DIR, "loop-lore.db",);
  if (oldPath !== dbPath) {
    for (const p of [oldPath, `${oldPath}-wal`, `${oldPath}-shm`,]) {
      if (existsSync(p,)) { archiveFile(p, log,); }
    }
  }

  log.info(`Dropping database at ${dbPath}...`,);

  // Close the eager module-level connection so file locks release
  await getDatabase().destroy();

  for (const p of [dbPath, walPath, shmPath,]) {
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

await reinit();
