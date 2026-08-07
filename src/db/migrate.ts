import type { Migration, } from "kysely/migration";
import { Migrator, } from "kysely/migration";
import { readdirSync, } from "node:fs";
import path from "node:path";
import { createLogger, getLogger, } from "../logger";
import { getDatabase, } from "./index";

export async function runMigrations(database: ReturnType<typeof getDatabase>,): Promise<void> {
  const migrator = new Migrator({
    db: database,
    provider: {
      async getMigrations(): Promise<Record<string, Migration>> {
        const migrationsDirectory = path.join(__dirname, "migrations",);
        const matched: string[] = [];
        for (const f of readdirSync(migrationsDirectory,)) {
          if (f.endsWith(".ts",)) { matched.push(f,); }
        }
        const files = matched.toSorted((a, b,) => a.localeCompare(b,));
        const migrations: Record<string, Migration> = {};
        for (const file of files) {
          const module = await import(path.join(migrationsDirectory, file,));
          const name = file.replace(/\.ts$/, "",);

          migrations[name] = module.default ?? module;
        }
        return migrations;
      },
    },
  },);

  const { error, results, } = await migrator.migrateToLatest();

  const log = getLogger().child({ module: "migrate", },);

  if (results) {
    for (const result of results) {
      log.info(`Migration ${result.migrationName}: ${result.status}`,);
    }
  }
  if (error) {
    log.error("Migration failed", error instanceof Error ? error : undefined,);
    throw new Error("Migration failed — see above",);
  }

  log.info("Database migrations completed successfully",);
}

async function migrate(): Promise<void> {
  createLogger();
  const database = getDatabase();
  await runMigrations(database,);
  await database.destroy();
}

// Run only when executed directly (bun run src/db/migrate.ts)
if (import.meta.main) {
  await migrate();
}
