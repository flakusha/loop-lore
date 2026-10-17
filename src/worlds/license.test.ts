// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/license.test.ts — world licensing (063).
 *
 * Covers the four acceptance cases: a declared prohibited use is rejected on
 * import, attribution survives an export->import round-trip, custom non-SPDX
 * text is accepted, and a malformed SPDX id is rejected.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { UseFlag, } from "../db/enums-story";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import {
  applyLicenseOnImport,
  getWorldLicense,
  LicenseError,
  LicenseViolationError,
  setWorldLicense,
  toLicenseManifest,
  validateImportLicense,
} from "./license";

let db: Kysely<DB>;

const ATTRIBUTION = {
  author: "Ada Lovelace",
  url: "https://example.invalid/worlds/w1",
  notice: "(c) 2026 Ada Lovelace",
};

const CUSTOM_TEXT = "Use freely, but keep the name of the world intact.";

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Source World", { id: "w1", },);
  await insertWorlds(db, "user-owner", "Target World", { id: "w2", },);
},);

afterEach(async () => {
  await db.destroy();
},);

describe("setWorldLicense / getWorldLicense", () => {
  test("stores an SPDX license and reads it back decoded", async () => {
    await setWorldLicense(db, "w1", {
      spdxId: "CC-BY-4.0",
      attribution: ATTRIBUTION,
      allowedUse: [UseFlag.View, UseFlag.Share,],
      prohibitedUse: [UseFlag.Commercial,],
    },);

    const license = await getWorldLicense(db, "w1",);
    expect(license?.kind,).toBe("spdx",);
    expect(license?.spdxId,).toBe("CC-BY-4.0",);
    expect(license?.licenseText,).toBeNull();
    expect(license?.allowedUse,).toEqual([UseFlag.View, UseFlag.Share,],);
    expect(license?.prohibitedUse,).toEqual([UseFlag.Commercial,],);
  });

  test("accepts a custom (non-SPDX) license text", async () => {
    const license = await setWorldLicense(db, "w1", {
      licenseText: CUSTOM_TEXT,
      attribution: ATTRIBUTION,
      allowedUse: [UseFlag.View,],
    },);

    expect(license.kind,).toBe("custom",);
    expect(license.licenseText,).toBe(CUSTOM_TEXT,);
    expect(license.spdxId,).toBeNull();
    expect((await getWorldLicense(db, "w1",))?.licenseText,).toBe(CUSTOM_TEXT,);
  });

  test("rejects a malformed SPDX identifier", async () => {
    await expect(setWorldLicense(db, "w1", { spdxId: "CC BY 4.0!!", },),).rejects.toBeInstanceOf(
      LicenseError,
    );

    expect(await getWorldLicense(db, "w1",),).toBeNull();
  });

  test("rejects a license that supplies both an SPDX id and custom text", async () => {
    await expect(
      setWorldLicense(db, "w1", { spdxId: "MIT", licenseText: CUSTOM_TEXT, },),
    ).rejects.toBeInstanceOf(LicenseError,);
  });

  test("rejects a license that supplies neither payload", async () => {
    await expect(setWorldLicense(db, "w1", {},),).rejects.toBeInstanceOf(LicenseError,);
  });

  test("replacing a license keeps one row per world", async () => {
    await setWorldLicense(db, "w1", { spdxId: "MIT", },);
    await setWorldLicense(db, "w1", { spdxId: "Apache-2.0", },);

    const rows = await db.selectFrom("world_licenses",).selectAll().where("world_id", "=", "w1",).execute();
    expect(rows.length,).toBe(1,);
    expect((await getWorldLicense(db, "w1",))?.spdxId,).toBe("Apache-2.0",);
  });

  test("rejects an unknown world", async () => {
    await expect(setWorldLicense(db, "nope", { spdxId: "MIT", },),).rejects.toBeInstanceOf(LicenseError,);
  });
});

describe("validateImportLicense", () => {
  test("accepts a use that is granted and not withheld", async () => {
    const license = await setWorldLicense(db, "w1", {
      spdxId: "CC-BY-4.0",
      allowedUse: [UseFlag.View, UseFlag.Share,],
      prohibitedUse: [UseFlag.Commercial,],
    },);

    const result = validateImportLicense({
      license,
      declaredProhibitedUse: [UseFlag.Share,],
    },);

    expect(result,).toEqual({ ok: true, },);
  });

  test("rejects a declared prohibited use and names it", async () => {
    const license = await setWorldLicense(db, "w1", {
      spdxId: "CC-BY-4.0",
      allowedUse: [UseFlag.View,],
      prohibitedUse: [UseFlag.Commercial, UseFlag.TrainModel,],
    },);

    const result = validateImportLicense({
      license,
      declaredProhibitedUse: [UseFlag.View, UseFlag.Commercial,],
    },);

    expect(result.ok,).toBe(false,);
    if (result.ok) { throw new Error("expected a violation",); }
    expect(result.violations,).toEqual([UseFlag.Commercial,],);
  });

  test("rejects a use that was never granted, even when unlisted as prohibited", async () => {
    const license = await setWorldLicense(db, "w1", {
      spdxId: "MIT",
      allowedUse: [UseFlag.View,],
    },);

    const result = validateImportLicense({ license, declaredProhibitedUse: [UseFlag.Commercial,], },);
    expect(result.ok,).toBe(false,);
  });
});

describe("export -> import round trip", () => {
  test("attribution survives the round trip", async () => {
    const source = await setWorldLicense(db, "w1", {
      spdxId: "CC-BY-SA-4.0",
      attribution: ATTRIBUTION,
      allowedUse: [UseFlag.View, UseFlag.Share, UseFlag.Redistribute,],
      prohibitedUse: [UseFlag.Commercial,],
    },);

    const manifest = toLicenseManifest({ license: source, },);
    // The manifest travels as JSON, exactly as the export bundle writes it.
    const bundle = { worldId: "w2", license: JSON.parse(JSON.stringify(manifest,),), };

    const imported = await applyLicenseOnImport({ db, bundle, },);
    expect(imported?.attribution,).toEqual(ATTRIBUTION,);
    expect(imported?.spdxId,).toBe("CC-BY-SA-4.0",);
    expect(imported?.allowedUse,).toEqual([UseFlag.View, UseFlag.Share, UseFlag.Redistribute,],);
    expect(imported?.prohibitedUse,).toEqual([UseFlag.Commercial,],);
    expect((await getWorldLicense(db, "w2",))?.attribution.notice,).toBe("(c) 2026 Ada Lovelace",);
  });

  test("a custom license text survives the round trip", async () => {
    const source = await setWorldLicense(db, "w1", {
      licenseText: CUSTOM_TEXT,
      attribution: ATTRIBUTION,
      allowedUse: [UseFlag.View,],
    },);

    const bundle = { worldId: "w2", license: toLicenseManifest({ license: source, },), };
    const imported = await applyLicenseOnImport({ db, bundle, },);

    expect(imported?.kind,).toBe("custom",);
    expect(imported?.licenseText,).toBe(CUSTOM_TEXT,);
  });

  test("a bundle without a license imports nothing", async () => {
    expect(await applyLicenseOnImport({ db, bundle: { worldId: "w2", }, },),).toBeNull();
    expect(await getWorldLicense(db, "w2",),).toBeNull();
  });

  test("REJECTS an import declaring a prohibited use", async () => {
    const source = await setWorldLicense(db, "w1", {
      spdxId: "CC-BY-4.0",
      attribution: ATTRIBUTION,
      allowedUse: [UseFlag.View,],
      prohibitedUse: [UseFlag.Commercial,],
    },);

    const bundle = { worldId: "w2", license: toLicenseManifest({ license: source, },), };

    await expect(
      applyLicenseOnImport({ db, bundle, declaredProhibitedUse: [UseFlag.Commercial,], },),
    ).rejects.toBeInstanceOf(LicenseViolationError,);
  });

  test("accepts an import whose declared uses are all granted", async () => {
    const source = await setWorldLicense(db, "w1", {
      spdxId: "CC-BY-4.0",
      allowedUse: [UseFlag.View, UseFlag.Share,],
      prohibitedUse: [UseFlag.Commercial,],
    },);

    const bundle = { worldId: "w2", license: toLicenseManifest({ license: source, },), };
    const imported = await applyLicenseOnImport({
      db,
      bundle,
      declaredProhibitedUse: [UseFlag.View, UseFlag.Share,],
    },);

    expect(imported?.allowedUse,).toEqual([UseFlag.View, UseFlag.Share,],);
  });

  test("rejects a bundle carrying a malformed SPDX identifier", async () => {
    const source = await setWorldLicense(db, "w1", { spdxId: "MIT", },);
    const manifest = { ...toLicenseManifest({ license: source, },), spdx_id: "not a license!!", };

    await expect(
      applyLicenseOnImport({ db, bundle: { worldId: "w2", license: manifest, }, },),
    ).rejects.toBeInstanceOf(LicenseError,);
  });
});
