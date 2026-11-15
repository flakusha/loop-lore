// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct unit tests for requireAssetOwner — owner allow, non-owner deny,
 * missing-asset deny, with indistinguishable deny bodies.
 */

import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { AssetType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../test-utils/insert-helpers";
import { requireAssetOwner, } from "./controller";

let fixture: TestDb | undefined;
let db: Kysely<DB>;
let ownerId: string;
let strangerId: string;
let assetId: string;

async function seed(): Promise<void> {
  fixture = await createTestDb();
  db = fixture.db;
  ownerId = await insertUsers(db, "asset-owner", "Asset Owner",);
  strangerId = await insertUsers(db, "asset-stranger", "Asset Stranger",);
  assetId = await insertAssets(db, ownerId, "owned.png", "image/png", AssetType.Image, 8, "/owned.png",);
}

async function teardown(): Promise<void> {
  if (fixture) {
    await destroyTestDb(fixture,);
    fixture = undefined;
  }
}

describe("requireAssetOwner", () => {
  test("owner gets the asset record", async () => {
    await seed();
    try {
      const result = await requireAssetOwner(db, assetId, ownerId,);
      expect(result,).not.toBeInstanceOf(Response,);
      if (result instanceof Response) { throw new Error("owner should not be denied",); }
      expect(result.id,).toBe(assetId,);
    } finally {
      await teardown();
    }
  });

  test("non-owner and missing asset get the same 404 body", async () => {
    await seed();
    try {
      const denied = await requireAssetOwner(db, assetId, strangerId,);
      const missing = await requireAssetOwner(db, "no-such-asset", strangerId,);

      expect(denied,).toBeInstanceOf(Response,);
      expect(missing,).toBeInstanceOf(Response,);
      if (!(denied instanceof Response) || !(missing instanceof Response)) {
        throw new Error("both should be denied",);
      }

      expect(denied.status,).toBe(404,);
      expect(missing.status,).toBe(404,);
      expect(await denied.text(),).toBe(await missing.text(),);
    } finally {
      await teardown();
    }
  });
});
