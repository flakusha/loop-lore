// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auto-matting enqueue helper tests.
 *
 * Covers: eligible raw asset enqueues a job, ineligible inputs are silent
 * no-ops, and an ineligible enqueue (e.g. missing asset) is logged not thrown.
 *
 * Resource contract: each test owns an isolated `createTestDb()` instance and
 * a fresh UUID owner, so the in-memory job-store and upload dir never collide
 * across tests or parallel workers. The temp upload dir is per-process
 * (mkdtemp) and shared read-write only via asset-id-keyed files.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createAsset, } from "../../assets/service/create";
import { makeMinimalPng, } from "../../assets/test-helpers";
import { AssetAlphaStatus, AssetType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { enqueueAutoMatting, } from "./auto-matte";
import { listJobs, } from "./job-store";
import type { MattingProvider, } from "./types";

const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-auto-matte-test-",),);

const okProvider: MattingProvider = {
  name: "stub-rembg",
  async removeBackground(): Promise<Buffer> {
    return makeMinimalPng(2, 1,);
  },
};

/** Create a raw-alpha asset for the owner and return its id. */
async function seedAsset(db: Kysely<DB>, ownerId: string,): Promise<string> {
  const { asset, } = await createAsset({
    database: db,
    uploadDir,
    input: {
      ownerId,
      filename: "sprite.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: makeMinimalPng(2, 1,).length,
      buffer: makeMinimalPng(2, 1,),
    },
  },);
  return asset.id;
}

describe("enqueueAutoMatting", () => {
  test("eligible raw asset + provider → job created", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "m owner", "M Owner",);
    const ownerId = (await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow()).id;
    const assetId = await seedAsset(db, ownerId,);

    await enqueueAutoMatting({
      database: db,
      uploadDir,
      assetId,
      alphaStatus: AssetAlphaStatus.Raw,
      ownerId,
      provider: okProvider,
    },);

    const jobs = listJobs(ownerId,);
    expect(jobs.length,).toBe(1,);
    expect(jobs[0]!.assetId,).toBe(assetId,);
    expect(["pending", "running",],).toContain(jobs[0]!.status,);
  });

  test("no provider → no job, no throw", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "m owner", "M Owner",);
    const ownerId = (await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow()).id;
    const assetId = await seedAsset(db, ownerId,);

    await enqueueAutoMatting({
      database: db,
      uploadDir,
      assetId,
      alphaStatus: AssetAlphaStatus.Raw,
      ownerId,
      provider: undefined,
    },);

    expect(listJobs(ownerId,).length,).toBe(0,);
  });

  test("native alpha status → no job", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "m owner", "M Owner",);
    const ownerId = (await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow()).id;
    const assetId = await seedAsset(db, ownerId,);

    await enqueueAutoMatting({
      database: db,
      uploadDir,
      assetId,
      alphaStatus: AssetAlphaStatus.Native,
      ownerId,
      provider: okProvider,
    },);

    expect(listJobs(ownerId,).length,).toBe(0,);
  });

  test("enqueue failure (missing asset) → logged, not thrown", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "m owner", "M Owner",);
    const ownerId = (await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow()).id;

    await enqueueAutoMatting({
      database: db,
      uploadDir,
      assetId: "nonexistent",
      alphaStatus: AssetAlphaStatus.Raw,
      ownerId,
      provider: okProvider,
    },);
    expect(listJobs(ownerId,).length,).toBe(0,);
  });
});
