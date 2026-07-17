import type { Kysely } from "kysely";
import type { DB } from "../../db/schema";
import type { DataMigration } from "./types";
import { getLogger } from "../../logger";

async function isApplied(db: Kysely<any>, table: string, toVersion: number): Promise<boolean> {
  const row = await db
    .selectFrom("data_migrations")
    .select("table_name")
    .where("table_name", "=", table)
    .where("to_version", "=", toVersion)
    .executeTakeFirst();
  return row !== undefined;
}

async function markApplied(db: Kysely<any>, migration: DataMigration): Promise<void> {
  await db
    .insertInto("data_migrations")
    .values({
      table_name: migration.table,
      from_version: migration.fromVersion,
      to_version: migration.toVersion,
      description: migration.description,
    })
    .execute();
}

async function discoverMigrations(): Promise<DataMigration[]> {
  const tasks: DataMigration[] = [];
  const { readdirSync, statSync } = await import("node:fs");
  const path = await import("node:path");
  const baseDir = __dirname;

  const entries = readdirSync(baseDir);
  for (const entry of entries.toSorted()) {
    const dirPath = path.join(baseDir, entry);
    if (!statSync(dirPath).isDirectory()) continue;

    const files = readdirSync(dirPath)
      .filter((f) => f.startsWith("v") && f.endsWith(".ts"))
      .toSorted();

    for (const file of files) {
      const mod = await import(path.join(dirPath, file));
      if (mod.migration) {
        tasks.push(mod.migration as DataMigration);
      }
    }
  }

  return tasks;
}

export async function runDataMigrations(db: Kysely<DB>, logProgress = true): Promise<void> {
  const log = getLogger().child({ module: "data-migrations" });
  const trackerDb = db as unknown as Kysely<any>;

  const migrations = await discoverMigrations();

  let applied = 0;
  for (const migration of migrations) {
    const alreadyDone = await isApplied(trackerDb, migration.table, migration.toVersion);
    if (alreadyDone) continue;

    if (logProgress) {
      log.info(`Data migration: ${migration.table} v${migration.fromVersion} → v${migration.toVersion}`, {
        description: migration.description,
      });
    }

    await migration.up(db);
    await markApplied(trackerDb, migration);

    if (logProgress) {
      log.info(`Data migration complete: ${migration.table} v${migration.toVersion}`);
    }
    applied++;
  }

  if (logProgress) {
    if (applied === 0) {
      log.info("All data migrations already applied");
    } else {
      log.info(`${applied} data migration(s) applied`);
    }
  }
}
