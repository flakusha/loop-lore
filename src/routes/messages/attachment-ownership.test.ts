// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { insertAssets, insertUsers, } from "../../test-utils/insert-helpers";
import { AttachmentOwnershipError, verifyAttachmentsOwned, } from "./attachment-ownership";

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  ({ db, sqlite, } = await createTestDb());
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertUsers(db, "other", "Other", { id: "user-other", },);
  await insertAssets(db, "user-owner", "a.png", "image/png", "image", 10, "/a.png", {
    id: "asset-owned",
  },);
  await insertAssets(db, "user-other", "b.png", "image/png", "image", 10, "/b.png", {
    id: "asset-other",
  },);
},);

describe("verifyAttachmentsOwned", () => {
  test("returns immediately when there are no attachments", async () => {
    await expect(verifyAttachmentsOwned(db, [], "user-owner",),).resolves.toBeUndefined();
  });

  test("passes when every asset is owned by the caller", async () => {
    await expect(
      verifyAttachmentsOwned(db, [{ assetId: "asset-owned", },], "user-owner",),
    ).resolves.toBeUndefined();
  });

  test("throws AttachmentOwnershipError for an asset owned by someone else", async () => {
    const error = await verifyAttachmentsOwned(
      db,
      [{ assetId: "asset-other", },],
      "user-owner",
    ).catch((e: unknown,) => e);
    expect(error,).toBeInstanceOf(AttachmentOwnershipError,);
    expect((error as AttachmentOwnershipError).name,).toBe("AttachmentOwnershipError",);
    expect((error as Error).message,).toContain("asset-other",);
  });

  test("throws for an asset id that does not exist", async () => {
    await expect(
      verifyAttachmentsOwned(db, [{ assetId: "asset-missing", },], "user-owner",),
    ).rejects.toBeInstanceOf(AttachmentOwnershipError,);
  });

  test("fails on the first violation in a mixed list", async () => {
    const error = await verifyAttachmentsOwned(
      db,
      [{ assetId: "asset-owned", }, { assetId: "asset-other", },],
      "user-owner",
    ).catch((e: unknown,) => e);
    expect(error,).toBeInstanceOf(AttachmentOwnershipError,);
    expect((error as Error).message,).toContain("asset-other",);
  });
});
