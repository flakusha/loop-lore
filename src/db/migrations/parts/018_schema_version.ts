// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, sql, } from "kysely";

/**
 * Queryable schema-version table (FEAT-040).
 *
 * `kysely_migration` tracks which migrations ran, but its names are opaque
 * to app code. `schema_version` holds one row per parts/ number so the
 * application (health checks, admin UI, support dumps) can answer "what
 * schema is this DB on" with a single MAX query.
 *
 * Backfill: this part inserts rows for every part 001–018 with a short
 * description. Future parts must add their own row — use
 * `recordSchemaVersion` from `src/db/schema-version.ts` (INSERT OR IGNORE,
 * safe to call from any part's `up()`).
 *
 * NOTE: the CREATE uses the schema builder (not raw SQL) because
 * `scripts/generate-db-types.ts` and `scripts/generate-schema-manifest.ts`
 * only recognise `.createTable(...).addColumn(...)` chains.
 */

interface PartSeed {
  version: number;
  description: string;
}

const PARTS: readonly PartSeed[] = [
  { version: 1, description: "core tables", },
  { version: 2, description: "assets", },
  { version: 3, description: "worlds", },
  { version: 4, description: "actors", },
  { version: 5, description: "characters", },
  { version: 6, description: "chat", },
  { version: 7, description: "personas", },
  { version: 8, description: "story", },
  { version: 9, description: "crafting", },
  { version: 10, description: "progression", },
  { version: 11, description: "blog", },
  { version: 12, description: "memory", },
  { version: 13, description: "generation", },
  { version: 14, description: "moderation", },
  { version: 15, description: "e2e helpers", },
  { version: 16, description: "fts indexes", },
  { version: 17, description: "drop template visual_novel", },
  { version: 18, description: "schema_version table", },
];

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("schema_version",)
    .addColumn("version", "integer", (col,) => col.primaryKey(),)
    .addColumn("applied_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("description", "text",)
    .execute();

  for (const part of PARTS) {
    await sql`INSERT OR IGNORE INTO schema_version (version, description)
      VALUES (${part.version}, ${part.description})`.execute(database,);
  }
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("schema_version",).execute();
}
