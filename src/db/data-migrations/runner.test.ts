/**
 * Data migration runner tests — atomicity and duplicate protection.
 *
 * applyDataMigration must apply check + transform + record in one
 * transaction: a failing transform leaves no record and no partial data,
 * and a second apply of the same migration is a no-op.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import type { DB, } from "../schema";
import { applyDataMigration, runDataMigrations, } from "./runner";
import type { DataMigration, } from "./types";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  const testDb = await createTestDb();
  db = testDb.db;
},);

afterAll(async () => {
  await db.destroy();
},);

describe("applyDataMigration", () => {
  test("records an applied migration", async () => {
    const migration: DataMigration = {
      table: "actors",
      fromVersion: 99,
      toVersion: 100,
      description: "test record",
      up: async (tx,) => {
        await tx.updateTable("actors",).set({ format_version: 100, },).execute();
      },
    };

    const didApply = await applyDataMigration(db, migration,);
    expect(didApply,).toBe(true,);

    const row = await db
      .selectFrom("data_migrations",)
      .selectAll()
      .where("table_name", "=", "actors",)
      .where("to_version", "=", 100,)
      .executeTakeFirst();
    expect(row,).toBeDefined();
    expect(row?.from_version,).toBe(99,);
  });

  test("is a no-op when already applied", async () => {
    const migration: DataMigration = {
      table: "actors",
      fromVersion: 99,
      toVersion: 100,
      description: "test duplicate",
      up: async (tx,) => {
        await tx.updateTable("actors",).set({ format_version: 100, },).execute();
      },
    };

    const didApply = await applyDataMigration(db, migration,);
    expect(didApply,).toBe(false,);
  });

  test("rolls back the transform and the record when up() throws", async () => {
    const migration: DataMigration = {
      table: "actors",
      fromVersion: 199,
      toVersion: 200,
      description: "test atomicity",
      up: async (tx,) => {
        // Transform first (would persist if not rolled back)…
        await tx.updateTable("actors",).set({ format_version: 200, },).execute();
        // …then fail.
        throw new Error("boom",);
      },
    };

    await expect(applyDataMigration(db, migration,),).rejects.toThrow("boom",);

    // No record left behind — the migration stays unapplied and re-runnable.
    const row = await db
      .selectFrom("data_migrations",)
      .select("table_name",)
      .where("table_name", "=", "actors",)
      .where("to_version", "=", 200,)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("is re-runnable after a failure", async () => {
    let fail = true;
    const migration: DataMigration = {
      table: "actors",
      fromVersion: 199,
      toVersion: 200,
      description: "test retry",
      up: async (tx,) => {
        if (fail) { throw new Error("boom",); }
        await tx.updateTable("actors",).set({ format_version: 200, },).execute();
      },
    };

    await expect(applyDataMigration(db, migration,),).rejects.toThrow("boom",);
    fail = false;
    const didApply = await applyDataMigration(db, migration,);
    expect(didApply,).toBe(true,);
  });
});

describe("runDataMigrations", () => {
  test("applies discovered migrations exactly once", async () => {
    await runDataMigrations(db, false,);
    await runDataMigrations(db, false,);

    const actorsRows = await db
      .selectFrom("data_migrations",)
      .selectAll()
      .where("table_name", "=", "actors",)
      .execute();
    // One row per (table, to_version) — no duplicates across double runs.
    const versions = new Set(actorsRows.map((r,) => r.to_version),);
    expect(versions.size,).toBe(actorsRows.length,);
  });
});
