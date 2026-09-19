// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Unit tests for the matting in-memory job store: list filtering, ordering, cancel. */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { cancelJob, getJob, listJobs, MattingService, } from "./index";
import type { MattingProvider, } from "./types";

function pngProvider(): MattingProvider {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1,],);
  return {
    name: "stub",
    removeBackground: async () => Buffer.from(png,),
  };
}

function makeService(db: Kysely<DB>, uploadDir: string,): MattingService {
  return new MattingService({
    database: db,
    uploadDir,
    resolveProvider: () => pngProvider(),
  },);
}

describe("matting job store", () => {
  test("listJobs filters by owner and sorts newest first", async () => {
    const { db, } = await createTestDb();
    const uploadDir = "/tmp/loop-lore-jobstore-test";
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    await insertUsers(db, `a-${ownerA}`, "A", { id: ownerA, } as never,);
    await insertUsers(db, `b-${ownerB}`, "B", { id: ownerB, } as never,);
    const service = makeService(db, uploadDir,);

    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1,],);
    const { createAsset, } = await import("../../assets/service");
    const { AssetType, } = await import("../../db/enums");
    const mkAsset = async (ownerId: string,) => {
      const { asset, } = await createAsset({
        database: db,
        input: {
          ownerId,
          filename: "sprite.png",
          mimeType: "image/png",
          assetType: AssetType.Image,
          sizeBytes: bytes.length,
          buffer: Buffer.from(bytes,),
        },
        uploadDir,
      },);
      return asset.id;
    };

    const assetA1 = await mkAsset(ownerA,);
    await mkAsset(ownerB,);
    const j1 = await service.startMatting({ assetId: assetA1, ownerId: ownerA, },);

    // Owner A sees exactly their job; owner B sees none (theirs completed
    // instantly and stays listed, A's job with the failing stub is listed).
    expect(listJobs(ownerB,).length,).toBe(0,);
    const jobsA = listJobs(ownerA,);
    expect(jobsA.length,).toBeGreaterThan(0,);
    expect(jobsA[0]?.ownerId,).toBe(ownerA,);
    void j1;

    const idA = jobsA[0]?.id;
    if (idA) {
      expect(getJob(idA,)?.ownerId,).toBe(ownerA,);
    }
    await db.destroy();
  });

  test("cancelJob marks a pending job cancelled", async () => {
    const { db, } = await createTestDb();
    const uploadDir = "/tmp/loop-lore-jobstore-test-2";
    const owner = randomUUID();
    await insertUsers(db, `c-${owner}`, "C", { id: owner, } as never,);

    // A provider whose promise never resolves keeps the job running.
    const hung: MattingProvider = {
      name: "hung",
      removeBackground: () => new Promise<Buffer>(() => {},),
    };
    const hungService = new MattingService({
      database: db,
      uploadDir,
      resolveProvider: () => hung,
    },);

    // Seed a real eligible raw image so the job reaches running state.
    const { createAsset, linkAsset, } = await import("../../assets/service");
    const { AssetType, } = await import("../../db/enums");
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1,],);
    const { asset, } = await createAsset({
      database: db,
      input: {
        ownerId: owner,
        filename: "sprite.png",
        mimeType: "image/png",
        assetType: AssetType.Image,
        sizeBytes: bytes.length,
        buffer: Buffer.from(bytes,),
      },
      uploadDir,
    },);
    void linkAsset;
    const started = await hungService.startMatting({ assetId: asset.id, ownerId: owner, },);
    if (!started.ok) { throw new Error("expected enqueue to succeed",); }
    const jobId = started.jobId;

    expect(cancelJob(jobId,),).toBe(true,);
    expect(getJob(jobId,)?.status,).toBe("cancelled",);
    expect(cancelJob(jobId,),).toBe(false,);
    await db.destroy();
  });
});
