// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting job lifecycle tests.
 *
 * Covers: eligibility state machine, success path (derivative asset + link +
 * `matted` status), failure path (raw stays usable), and ownership checks.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { mkdtempSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { initialAlphaStatus, } from "../../assets/service/alpha-status";
import { createAsset, } from "../../assets/service/create";
import { describePristine, } from "../../test-utils/pristine";

// lifecycle tests persist real assets via createAsset, which
// image-gen-route.test.ts replaces process-wide with mockCreateAsset.
const describeReal = describePristine(createAsset, "createAsset",);
import { getAssetLinks, } from "../../assets/service/links";
import { makeMinimalPng, } from "../../assets/test-helpers";
import { AssetAlphaStatus, AssetLinkEntity, AssetType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, } from "../../test-utils/insert-helpers";
import { MattingService, } from "./service";
import type { MattingProvider, } from "./types";

/** Minimal RGBA PNG (color type 6) for matting derivative assertions. */
function makeMinimalPngWithAlpha(width = 2, height = 1,): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10,],);
  const ihdr = Buffer.alloc(25,);
  ihdr.writeUInt32BE(13, 0,);
  ihdr.write("IHDR", 4, "ascii",);
  ihdr.writeUInt32BE(width, 8,);
  ihdr.writeUInt32BE(height, 12,);
  ihdr[16] = 8;
  ihdr[17] = 6;
  ihdr.writeUInt32BE(0, 21,);
  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,],);
  return Buffer.concat([sig, ihdr, iend,],);
}

const uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-matting-test-",),);

/** Create an asset for the owner and return its id. */
async function seedAsset(db: Kysely<DB>, ownerId: string, buffer: Buffer,): Promise<string> {
  const { asset, } = await createAsset({
    database: db,
    uploadDir,
    input: {
      ownerId,
      filename: "sprite.png",
      mimeType: "image/png",
      assetType: AssetType.Image,
      sizeBytes: buffer.length,
      buffer,
    },
  },);
  return asset.id;
}

const okProvider: MattingProvider = {
  name: "stub-rembg",
  async removeBackground(): Promise<Buffer> {
    return makeMinimalPngWithAlpha(4, 4,);
  },
};

const failingProvider: MattingProvider = {
  name: "failing-rembg",
  async removeBackground(): Promise<Buffer> {
    throw new Error("model exploded",);
  },
};

function makeService(db: Kysely<DB>, provider: MattingProvider | null,): MattingService {
  return new MattingService({
    database: db,
    uploadDir,
    resolveProvider: () => provider,
  },);
}

async function ownerIdFor(db: Kysely<DB>, username: string,): Promise<string> {
  return (await db.selectFrom("users",).select("id",).where("username", "=", username,).executeTakeFirstOrThrow()).id;
}

describe("alpha status state machine", () => {
  test("opaque images start raw, alpha images native, non-images unknown", () => {
    expect(initialAlphaStatus("image/png", false,),).toBe(AssetAlphaStatus.Raw,);
    expect(initialAlphaStatus("image/png", true,),).toBe(AssetAlphaStatus.Native,);
    expect(initialAlphaStatus("application/pdf", false,),).toBe(AssetAlphaStatus.Unknown,);
  });
});

describeReal("matting job lifecycle", () => {
  test("success stores matted derivative, links it, and sets alpha_status=matted", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "m owner", "M Owner",);
    const ownerId = await ownerIdFor(db, "m owner",);
    const assetId = await seedAsset(db, ownerId, makeMinimalPng(2, 1,),);

    const service = makeService(db, okProvider,);
    const started = await service.startMatting({ assetId, ownerId, },);
    expect(started.ok,).toBe(true,);
    if (!started.ok) { return; }
    await started.done;

    const job = service.getJob(started.jobId,);
    expect(job?.status,).toBe("completed",);
    expect(job?.mattedAssetId,).toBeTruthy();

    const raw = await db.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirstOrThrow();
    expect(raw.alpha_status,).toBe(AssetAlphaStatus.Matted,);

    const derivative = await db.selectFrom("assets",).selectAll().where("id", "=", job!.mattedAssetId!,)
      .executeTakeFirstOrThrow();
    expect(derivative.filename,).toBe("sprite-matted.png",);
    expect(derivative.alpha_status,).toBe(AssetAlphaStatus.Native,);

    const links = await getAssetLinks(db, derivative.id,);
    expect(links.some((l,) => l.entity_type === AssetLinkEntity.Asset && l.entity_id === assetId),).toBe(true,);
  });

  test("failure keeps the raw asset usable with alpha_status=matting_failed", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "f owner", "F Owner",);
    const ownerId = await ownerIdFor(db, "f owner",);
    const assetId = await seedAsset(db, ownerId, makeMinimalPng(2, 1,),);

    const service = makeService(db, failingProvider,);
    const started = await service.startMatting({ assetId, ownerId, },);
    expect(started.ok,).toBe(true,);
    if (!started.ok) { return; }
    await started.done;

    const job = service.getJob(started.jobId,);
    expect(job?.status,).toBe("failed",);
    expect(job?.error,).toContain("model exploded",);

    const raw = await db.selectFrom("assets",).selectAll().where("id", "=", assetId,).executeTakeFirstOrThrow();
    expect(raw.alpha_status,).toBe(AssetAlphaStatus.MattingFailed,);
  });

  test("native assets are not eligible and missing provider is rejected", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "n owner", "N Owner",);
    const ownerId = await ownerIdFor(db, "n owner",);
    const assetId = await seedAsset(db, ownerId, makeMinimalPngWithAlpha(2, 1,),);

    const noProvider = makeService(db, null,);
    const skipped = await noProvider.startMatting({ assetId, ownerId, },);
    expect(skipped,).toEqual({ ok: false, error: "not_eligible", },);

    const service = makeService(db, okProvider,);
    const ineligible = await service.startMatting({ assetId, ownerId, },);
    expect(ineligible,).toEqual({ ok: false, error: "not_eligible", },);
  });

  test("other owners cannot enqueue matting for an asset", async () => {
    const { db, } = await createTestDb();
    await insertUsers(db, "a owner", "A Owner",);
    await insertUsers(db, "b owner", "B Owner",);
    const ownerA = await ownerIdFor(db, "a owner",);
    const ownerB = await ownerIdFor(db, "b owner",);
    const assetId = await seedAsset(db, ownerA, makeMinimalPng(2, 1,),);

    const service = makeService(db, okProvider,);
    const result = await service.startMatting({ assetId, ownerId: ownerB, },);
    expect(result,).toEqual({ ok: false, error: "forbidden", },);
  });
});
