// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * importLicensing tests — single-row upsert into character_licensing with
 * the standard boolean fields (`allow_derivatives`, `allow_commercial`,
 * `share_alike`) defaulting to (1, 1, 0) when omitted, plus the
 * conditional nullable string fields (`custom_license_text`,
 * `attribution`) defaulting to null.
 *
 * Coverage pins:
 *   - no-op when data is undefined
 *   - insert path: default booleans applied + nullable strings null
 *   - update path: existing row overwritten in place (still 1 row)
 *   - error path: result.errors populated, no throw
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { LicenseType, } from "../../../db/enums-character/content";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { importLicensing, } from "./licensing";
import type { CharacterSystemsImportResult, } from "./types";

describe("importLicensing", () => {
  let db: Kysely<DB>;
  let actorId: string;
  let otherActorId: string;

  function emptyResult(): CharacterSystemsImportResult {
    return {
      traitsImported: 0,
      moodImported: false,
      relationshipsImported: 0,
      avatarsImported: 0,
      licensingImported: false,
      availabilityImported: false,
      worldSetupImported: false,
      errors: [],
    };
  }

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await db.insertInto("actors",).values({
      id: crypto.randomUUID(),
      display_name: "Test-Lic-1",
    },).execute();
    await db.insertInto("actors",).values({
      id: crypto.randomUUID(),
      display_name: "Test-Lic-2",
    },).execute();
    const rows = await db.selectFrom("actors",).select(["id",],)
      .where("display_name", "in", ["Test-Lic-1", "Test-Lic-2",],)
      .orderBy("display_name",).execute();
    actorId = rows[0]!.id;
    otherActorId = rows[1]!.id;
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("returns early when data is undefined", async () => {
    const result = emptyResult();
    await importLicensing(db, actorId, undefined, result,);
    expect(result.licensingImported,).toBe(false,);
    expect(result.errors,).toEqual([],);
  });

  test("inserts with default booleans (1,1,0) and null nullable strings", async () => {
    const result = emptyResult();
    await importLicensing(db, actorId, {
      licenseType: LicenseType.CcByNcSa,
    }, result,);

    expect(result.licensingImported,).toBe(true,);
    const row = await db.selectFrom("character_licensing",).selectAll()
      .where("actor_id", "=", actorId,).executeTakeFirstOrThrow();
    expect(row.license_type,).toBe(LicenseType.CcByNcSa,);
    expect(row.custom_license_text,).toBeNull();
    expect(row.attribution,).toBeNull();
    expect(row.allow_derivatives,).toBe(1,);
    expect(row.allow_commercial,).toBe(1,);
    expect(row.share_alike,).toBe(0,);
  });

  test("updates an existing row instead of inserting a duplicate", async () => {
    // Seed via the first call (insert path).
    const first = emptyResult();
    await importLicensing(db, otherActorId, {
      licenseType: LicenseType.Proprietary,
      customLicenseText: "All rights reserved",
      attribution: "Original",
      allowDerivatives: 0,
      allowCommercial: 0,
      shareAlike: 0,
    }, first,);
    expect(first.licensingImported,).toBe(true,);

    // Second call must hit the update branch.
    const second = emptyResult();
    await importLicensing(db, otherActorId, {
      licenseType: LicenseType.CcBy,
      allowDerivatives: 1,
      allowCommercial: 1,
      shareAlike: 1,
    }, second,);
    expect(second.licensingImported,).toBe(true,);

    const rows = await db.selectFrom("character_licensing",).selectAll()
      .where("actor_id", "=", otherActorId,).execute();
    expect(rows.length,).toBe(1,);
    expect(rows[0]!.license_type,).toBe(LicenseType.CcBy,);
    expect(rows[0]!.custom_license_text,).toBeNull();
    expect(rows[0]!.attribution,).toBeNull();
    expect(rows[0]!.share_alike,).toBe(1,);
  });

  test("captures DB errors into result.errors instead of throwing", async () => {
    const result = emptyResult();
    // Force failure by removing the table; the importer should swallow it.
    await db.schema.dropTable("character_licensing",).execute();
    await importLicensing(db, actorId, { licenseType: LicenseType.Custom, }, result,);
    expect(result.licensingImported,).toBe(false,);
    expect(result.errors.length,).toBe(1,);
    expect(result.errors[0]!,).toContain("Failed to import licensing:",);
    // Recreate so the rest of the suite isn't disturbed.
    await db.schema.createTable("character_licensing",).addColumn("id", "text", (c,) => c.primaryKey(),)
      .addColumn("actor_id", "text", (c,) => c.notNull(),)
      .addColumn("license_type", "text", (c,) => c.notNull(),)
      .addColumn("custom_license_text", "text",)
      .addColumn("attribution", "text",)
      .addColumn("allow_derivatives", "integer", (c,) => c.notNull(),)
      .addColumn("allow_commercial", "integer", (c,) => c.notNull(),)
      .addColumn("share_alike", "integer", (c,) => c.notNull(),)
      .addColumn("created_at", "text", (c,) => c.notNull(),)
      .addColumn("updated_at", "text", (c,) => c.notNull(),)
      .execute();
  });
});
