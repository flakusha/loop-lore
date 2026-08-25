// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Database, } from "bun:sqlite";
import { Kysely, } from "kysely";
import { existsSync, mkdirSync, renameSync, unlinkSync, } from "node:fs";
import path from "node:path";
import { DATA_DIR, } from "../config/constants";
import { createLogger, getLogger, } from "../logger";
import type { DB, } from "./schema";
import type { Logger, } from "../logger";
import { createSqliteDialect, getDatabase, } from "./index";
import { runMigrations, } from "./migrate";
import { seedDefaultActors, } from "./seed";

/** Move a DB file into the timestamped backup dir; fall back to unlink on cross-device rename. */
function archiveFile(p: string, log: Logger,): void {
  const backupDir = process.env.LOOP_LORE_BACKUP_DIR
    ?? path.resolve(DATA_DIR, "..", "loop-lore-data-backup",);
  mkdirSync(backupDir, { recursive: true, },);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-",);
  try {
    renameSync(p, path.join(backupDir, `${stamp}-${path.basename(p,)}`,),);
  } catch (err) {
    log.warn(`Could not archive ${p} (${String(err)}); removing instead`,);
    unlinkSync(p,);
  }
}

async function reinit(): Promise<void> {
  createLogger();
  const log = getLogger().child({ module: "reinit", },);

  const dbPath = process.env.LOOP_LORE_DB_PATH ?? path.resolve(DATA_DIR, "loop-lore.db",);
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
  await db.destroy();
  log.info("Database reinitialized successfully",);
}

await reinit();
