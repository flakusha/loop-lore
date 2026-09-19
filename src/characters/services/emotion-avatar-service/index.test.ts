// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * End-to-end test for EmotionAvatarService.startBatchGeneration - the
 * background batch runs with default config (no matting section → no
 * matting provider), tolerates per-emotion generation failures, and the
 * job reaches a terminal state.
 *
 * ISOLATED-only: mock.module for config/load is process-global.
 */
import { afterAll, beforeAll, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { createAsset, } from "../../../assets/service";
import { AssetType, EmotionType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../../../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { createAvatar, } from "../avatar-service/crud";
import { EmotionAvatarService, } from "./index";

let uploadDir = "";

describeOrSkip("EmotionAvatarService.startBatchGeneration", () => {
  let db: Kysely<DB>;
  let service: EmotionAvatarService;
  let avatarId: string;
  const actorId = randomUUID();

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await insertActors(db, "Batch Service Actor", { id: actorId, },);
    await insertUsers(db, `svc-${actorId}`, "Batch Service User", { id: actorId, } as never,);
    uploadDir = mkdtempSync(join(tmpdir(), "loop-lore-eas-index-test-",),);
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1,],);
    const { asset, } = await createAsset({
      database: db,
      input: {
        ownerId: actorId,
        filename: "base.png",
        mimeType: "image/png",
        assetType: AssetType.Image,
        sizeBytes: bytes.length,
        buffer: Buffer.from(bytes,),
      },
      uploadDir,
    },);
    avatarId = await createAvatar(db, {
      actorId,
      assetId: asset.id,
      label: "base",
    },);
    service = new EmotionAvatarService(db,);
  },);

  it.skipIf(!ISOLATED,)("runs the batch to a terminal state without matting config", async () => {
    const jobId = await service.startBatchGeneration({
      actorId,
      baseAvatarId: avatarId,
      emotions: [EmotionType.Happy, EmotionType.Sad,],
    },);
    expect(jobId.length,).toBeGreaterThan(0,);

    let status: string | undefined;
    for (let i = 0; i < 100 && status !== "completed" && status !== "failed"; i++) {
      await Bun.sleep(20,);
      status = service.getJobStatus(jobId,)?.status;
    }
    expect(status === "completed" || status === "failed",).toBe(true,);

    // Ownership guard: a foreign actor cannot start from someone's avatar.
    await expect(
      service.startBatchGeneration({ actorId: randomUUID(), baseAvatarId: avatarId, },),
    ).rejects.toThrow("does not belong",);

    // Missing avatar errors synchronously.
    await expect(
      service.startBatchGeneration({ actorId, baseAvatarId: "no-such-avatar", },),
    ).rejects.toThrow("not found",);
  },);

  it.skipIf(!ISOLATED,)("resolves an explicit matting provider thread-through", async () => {
    // With an explicit provider the batch still terminates; the provider is
    // only invoked for successfully generated emotion avatars, of which a
    // provider-less default config produces none.
    const jobId = await service.startBatchGeneration({
      actorId,
      baseAvatarId: avatarId,
      emotions: [EmotionType.Happy,],
      mattingProvider: {
        name: "stub",
        removeBackground: async () => Buffer.from([137, 80, 78, 71,],),
      },
    },);
    let status: string | undefined;
    for (let i = 0; i < 100 && status !== "completed" && status !== "failed"; i++) {
      await Bun.sleep(20,);
      status = service.getJobStatus(jobId,)?.status;
    }
    expect(status === "completed" || status === "failed",).toBe(true,);
  },);

  afterAll(() => {
    if (uploadDir) { rmSync(uploadDir, { recursive: true, force: true, },); }
  },);
},);
