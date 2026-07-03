import { Migrator } from "kysely/migration";
import path from "node:path";
import { readdirSync } from "node:fs";
import { getDb } from "./index";
import type { Migration } from "kysely/migration";

async function migrate(): Promise<void> {
  const db = getDb();

  const migrator = new Migrator({
    db,
    provider: {
      async getMigrations(): Promise<Record<string, Migration>> {
        const migrationsDir = path.join(__dirname, "migrations");
        const files = readdirSync(migrationsDir)
          .filter((f) => f.endsWith(".ts"))
          .sort((a, b) => a.localeCompare(b));
        const migrations: Record<string, Migration> = {};
        for (const file of files) {
          const migration: Migration = (await import(path.join(migrationsDir, file))) as Migration;
          const name = file.replace(/\.ts$/, "");
          migrations[name] = migration;
        }
        return migrations;
      },
    },
  });

  const { error, results } = await migrator.migrateToLatest();

  if (results) {
    for (const result of results) {
      console.log(`Migration ${result.migrationName}: ${result.status}`);
    }
  }
  if (error) {
    console.error("Migration failed:", error);
    throw new Error("Migration failed — see above");
  }

  console.log("Database migrations completed successfully");
  await db.destroy();
}

await migrate();
