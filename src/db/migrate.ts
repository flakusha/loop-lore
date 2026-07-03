import { Migrator } from "kysely/migration";
import path from "node:path";
import { readdirSync } from "node:fs";
import { getDatabase } from "./index";
import { getLogger } from "../logger";
import type { Migration } from "kysely/migration";

async function migrate(): Promise<void> {
  const database = getDatabase();

  const migrator = new Migrator({
    db: database,
    provider: {
      async getMigrations(): Promise<Record<string, Migration>> {
        const migrationsDirectory = path.join(__dirname, "migrations");
        const files = readdirSync(migrationsDirectory)
          .filter((f): f is string => f.endsWith(".ts"))
          .toSorted((a, b) => a.localeCompare(b));
        const migrations: Record<string, Migration> = {};
        for (const file of files) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const module = await import(path.join(migrationsDirectory, file));
          const name = file.replace(/\.ts$/, "");
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          migrations[name] = module.default ?? module;
        }
        return migrations;
      },
    },
  });

  const { error, results } = await migrator.migrateToLatest();

  const log = getLogger().child({ module: "migrate" });

  if (results) {
    for (const result of results) {
      log.info(`Migration ${result.migrationName}: ${result.status}`);
    }
  }
  if (error) {
    log.error("Migration failed", error instanceof Error ? error : undefined);
    throw new Error("Migration failed — see above");
  }

  log.info("Database migrations completed successfully");
  await database.destroy();
}

await migrate();
