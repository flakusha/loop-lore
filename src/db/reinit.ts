import { unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { Kysely } from "kysely";
import { createLogger, getLogger } from "../logger";
import { runMigrations } from "./migrate";
import { seedDefaultActors } from "./seed";
import { DATA_DIR } from "../config/constants";
import { createSqliteDialect, getDatabase } from "./index";
import type { DB } from "./schema";

async function reinit(): Promise<void> {
  createLogger();
  const log = getLogger().child({ module: "reinit" });

  const dbPath = process.env.LOOP_LORE_DB_PATH ?? path.resolve(DATA_DIR, "loop-lore.db");
  const walPath = dbPath + "-wal";
  const shmPath = dbPath + "-shm";

  // Clean up old mangled path (pre-fix: path.join with absolute DATA_DIR)
  const oldPath = path.join(process.cwd(), DATA_DIR, "loop-lore.db");
  if (oldPath !== dbPath) {
    for (const p of [oldPath, oldPath + "-wal", oldPath + "-shm"]) {
      if (existsSync(p)) unlinkSync(p);
    }
  }

  log.info(`Dropping database at ${dbPath}...`);

  // Close the eager module-level connection so file locks release
  await getDatabase().destroy();

  for (const p of [dbPath, walPath, shmPath]) {
    if (existsSync(p)) {
      unlinkSync(p);
    }
  }

  log.info("Running migrations...");
  const sqlite = new Database(dbPath);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  const dialect = createSqliteDialect(sqlite);
  const db = new Kysely<DB>({ dialect });
  await runMigrations(db);
  await seedDefaultActors(db);
  await db.destroy();
  log.info("Database reinitialized successfully");
}

await reinit();
