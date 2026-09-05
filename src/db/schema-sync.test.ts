import { describe, expect, test, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { SCHEMA, } from "./schema-manifest";

/**
 * Schema Sync Test
 *
 * Verifies that the migrated database matches the schema manifest.
 * The manifest (schema-manifest.ts) is AUTO-GENERATED from the migration
 * files — the migrations are the single source of truth. When adding or
 * changing a table/column:
 *   1. Add/edit the migration file
 *   2. Regenerate the schema artifacts: bun run db:sync-types && bun run db:sync-manifest
 *   3. Run `bun run schemas:check` (the `check` gate) to confirm nothing is stale
 *   4. This test validates the migrated DB matches the manifest
 */

describe("schema sync — migrated DB vs manifest", () => {
  test("all manifest tables exist in migrated DB", async () => {
    const { db, sqlite, } = await createTestDb();
    const { missingTables, extraTables, } = SCHEMA.verify(sqlite,);

    if (missingTables.length > 0) {
      console.log("[schema-sync] tables in manifest but NOT in migrated DB:", missingTables,);
    }
    if (extraTables.length > 0) {
      console.log("[schema-sync] tables in migrated DB but NOT in manifest:", extraTables,);
    }

    expect(missingTables, "manifest tables missing from migrations",).toHaveLength(0,);

    await db.destroy();
    sqlite.close();
  });

  test("all manifest columns match migrated DB columns", async () => {
    const { db, sqlite, } = await createTestDb();
    const { columnMismatches, } = SCHEMA.verify(sqlite,);

    if (columnMismatches.length > 0) {
      console.log("[schema-sync] column mismatches:",);
      for (const m of columnMismatches) {
        if (m.missingInDb.length > 0) {
          console.log(`  ${m.table}: in manifest but NOT in DB: ${m.missingInDb.join(", ",)}`,);
        }
        if (m.extraInDb.length > 0) {
          console.log(`  ${m.table}: in DB but NOT in manifest: ${m.extraInDb.join(", ",)}`,);
        }
      }
    }

    // Fail if any columns are in manifest but missing from DB (migration bug)
    const missingCols = columnMismatches.filter((m,) => m.missingInDb.length > 0);
    expect(
      missingCols.map((m,) => `${m.table}: ${m.missingInDb.join(", ",)}`).join("; ",),
      "columns in manifest but missing from DB",
    ).toHaveLength(0,);

    // Extra columns in DB are warnings only — may be added by migrations before schema update
    if (columnMismatches.some((m,) => m.extraInDb.length > 0)) {
      console.log("[schema-sync] INFO: extra DB columns (may need manifest update)",);
    }

    await db.destroy();
    sqlite.close();
  });

  test("manifest covers all DB tables (no unexpected extras)", async () => {
    const { db, sqlite, } = await createTestDb();
    const { extraTables, } = SCHEMA.verify(sqlite,);

    // Extra tables in DB but not in manifest need investigation
    if (extraTables.length > 0) {
      console.log("[schema-sync] tables in DB but NOT in manifest:", extraTables,);
    }
    expect(extraTables, "unexpected tables not in manifest",).toHaveLength(0,);

    await db.destroy();
    sqlite.close();
  });
});
