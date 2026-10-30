// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TASK-emotion-avatar-regen-atomicity-and-subset-regression-tests.
 *
 * Default-suite (no `--isolate`): no `mock.module` anywhere. The batch loop
 * runs with a stubbed `generateEmotionAvatar` on the dispatch handle plus
 * the `imageProvider` management override, so the config/provider preamble
 * passes without touching process-global module state.
 *
 * Pins, against real DB rows + the real AvatarService:
 * - subset regen re-rolls ONLY the requested slots (siblings keep assets);
 * - a failing slot keeps the old variant bound (no avatar-less window);
 * - outfit-scoped regen never reaches other outfits or the base scope.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { ImageProviderConfig, } from "../../../config/schema";
import { EmotionType, } from "../../../db/enums";
import { AssetType, } from "../../../db/enums-content";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../../test-utils/create-test-db";
import { insertAssets, insertWardrobeItems, } from "../../../test-utils/insert-helpers";
import { AvatarService, } from "../avatar-service";
import { createTestActors, } from "../test-helpers";
import type { GenerationDispatchHandle, } from "./generation";
import { runBatchGeneration, } from "./generation";
import { createJob, } from "./job-store";
import type { BatchJobId, GenerateEmotionAvatarsOpts, } from "./types";

const FAKE_SD = {
  name: "test-sd-atomicity",
  label: "Test SD",
  baseUrl: "http://127.0.0.1:7860",
  apiFamily: "sdcpp",
  purpose: "generate",
  timeout: 5000,
  generationTimeout: 30_000,
  defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
} as unknown as ImageProviderConfig;

/** Scripted single-slot generator; throws when the test arms a failure. */
let generateImpl: GenerationDispatchHandle["generateEmotionAvatar"];

/**
 * @param db
 * @param avatars - real AvatarService over the same handle
 * @returns dispatch handle with a scripted generator
 */
function makeSvc(db: Kysely<DB>, avatars: AvatarService,): GenerationDispatchHandle {
  return {
    db,
    avatarService: avatars,
    resolveEmotionPromptModifier: () => "",
    generateEmotionAvatar: (opts,) => generateImpl(opts,),
  };
}

/**
 * @param db
 * @param owner
 * @param names - asset ids to insert
 * @returns void
 */
async function seedAssets(db: Kysely<DB>, owner: string, names: string[],): Promise<void> {
  for (const name of names) {
    await insertAssets(db, owner, `${name}.png`, "image/png", AssetType.Image, 1024, `/test/${name}.png`, {
      id: `asset-${name}`,
    },);
  }
}

/**
 * @param opts
 * @returns batch opts for the shared fake provider
 */
function makeOpts(opts: Partial<GenerateEmotionAvatarsOpts> & { actorId: string },): GenerateEmotionAvatarsOpts {
  return { baseAvatarId: "avatar-base", imageProvider: FAKE_SD, ...opts, };
}

describe("emotion-avatar regen atomicity (default suite)", () => {
  let testDb: TestDb;
  let db: Kysely<DB>;
  let avatars: AvatarService;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    testDb = await createTestDb();
    db = testDb.db;
    avatars = new AvatarService(db,);
  },);

  afterAll(async () => {
    await destroyTestDb(testDb,);
  },);

  test("subset regen re-rolls only the requested slot; siblings keep asset ids", async () => {
    const { userId, actorId, } = await createTestActors(db, "actor-regen-subset",);
    await seedAssets(db, userId, ["sub-old-happy", "sub-old-sad", "sub-fresh-happy",],);

    const oldHappy = await avatars.createAvatar({
      actorId,
      assetId: "asset-sub-old-happy",
      label: "old happy",
      tags: { emotion: EmotionType.Happy, },
    },);

    const oldSad = await avatars.createAvatar({
      actorId,
      assetId: "asset-sub-old-sad",
      label: "old sad",
      tags: { emotion: EmotionType.Sad, },
    },);

    generateImpl = async (opts,) => ({
      avatarId: await avatars.createAvatar({
        actorId,
        assetId: "asset-sub-fresh-happy",
        label: "fresh happy",
        tags: { emotion: opts.emotion, },
      },),
      assetId: "asset-sub-fresh-happy",
    });

    const job = createJob({
      id: "job-regen-subset" as BatchJobId,
      actorId,
      baseAvatarId: oldHappy,
      emotions: [EmotionType.Happy,],
    },);

    await runBatchGeneration(makeSvc(db, avatars,), job, makeOpts({ actorId, replace: true, },),);

    expect(job.status,).toBe("completed",);
    expect(job.results,).toHaveLength(1,);
    // Sibling sad slot untouched: same row, same asset.
    const sad = await avatars.getAvatar(oldSad,);
    expect(sad?.assetId,).toBe("asset-sub-old-sad",);
    // Happy slot re-pointed at the fresh asset, old row cleaned up.
    expect(await avatars.getAvatar(oldHappy,),).toBeUndefined();
    expect(job.results[0]?.assetId,).toBe("asset-sub-fresh-happy",);
  });

  test("failure-injection keeps the old variant bound until the new one commits", async () => {
    const { userId, actorId, } = await createTestActors(db, "actor-regen-failure",);
    await seedAssets(db, userId, ["fail-old-happy",],);

    const oldHappy = await avatars.createAvatar({
      actorId,
      assetId: "asset-fail-old-happy",
      label: "old happy",
      tags: { emotion: EmotionType.Happy, },
    },);

    generateImpl = async () => {
      throw new Error("provider down",);
    };

    const job = createJob({
      id: "job-regen-failure" as BatchJobId,
      actorId,
      baseAvatarId: oldHappy,
      emotions: [EmotionType.Happy,],
    },);

    await runBatchGeneration(makeSvc(db, avatars,), job, makeOpts({ actorId, replace: true, },),);

    expect(job.status,).toBe("failed",);
    expect(job.results[0]?.status,).toBe("failed",);
    // No avatar-less window: the previous variant is still the bound one.
    const kept = await avatars.getAvatar(oldHappy,);
    expect(kept?.assetId,).toBe("asset-fail-old-happy",);
  });

  test("outfit-scoped regen never reaches other outfits or the base scope", async () => {
    const { userId, actorId, } = await createTestActors(db, "actor-regen-outfit",);
    await seedAssets(db, userId, [
      "out-old-armor-happy",
      "out-old-armor-sad",
      "out-old-court-happy",
      "out-old-base-happy",
      "out-fresh-armor-happy",
    ],);

    const armor = await insertWardrobeItems(db, "Armor", { id: "outfit-armor", actor_id: actorId, },);
    const court = await insertWardrobeItems(db, "Court", { id: "outfit-court", actor_id: actorId, },);

    const oldArmorHappy = await avatars.createAvatar({
      actorId,
      assetId: "asset-out-old-armor-happy",
      label: "old armor happy",
      tags: { emotion: EmotionType.Happy, },
      outfitId: armor,
    },);

    const armorSad = await avatars.createAvatar({
      actorId,
      assetId: "asset-out-old-armor-sad",
      label: "armor sad",
      tags: { emotion: EmotionType.Sad, },
      outfitId: armor,
    },);

    const courtHappy = await avatars.createAvatar({
      actorId,
      assetId: "asset-out-old-court-happy",
      label: "court happy",
      tags: { emotion: EmotionType.Happy, },
      outfitId: court,
    },);

    const baseHappy = await avatars.createAvatar({
      actorId,
      assetId: "asset-out-old-base-happy",
      label: "base happy",
      tags: { emotion: EmotionType.Happy, },
    },);

    generateImpl = async (opts,) => ({
      avatarId: await avatars.createAvatar({
        actorId,
        assetId: "asset-out-fresh-armor-happy",
        label: "fresh armor happy",
        tags: { emotion: opts.emotion, },
        outfitId: armor,
      },),
      assetId: "asset-out-fresh-armor-happy",
    });

    const job = createJob({
      id: "job-regen-outfit" as BatchJobId,
      actorId,
      baseAvatarId: baseHappy,
      emotions: [EmotionType.Happy,],
    },);

    await runBatchGeneration(makeSvc(db, avatars,), job, makeOpts({ actorId, outfitId: armor, replace: true, },),);

    expect(job.status,).toBe("completed",);
    // Same (emotion, outfit) slot replaced…
    expect(await avatars.getAvatar(oldArmorHappy,),).toBeUndefined();
    expect(job.results[0]?.assetId,).toBe("asset-out-fresh-armor-happy",);
    // …every other scope untouched.
    expect((await avatars.getAvatar(armorSad,))?.assetId,).toBe("asset-out-old-armor-sad",);
    expect((await avatars.getAvatar(courtHappy,))?.assetId,).toBe("asset-out-old-court-happy",);
    expect((await avatars.getAvatar(baseHappy,))?.assetId,).toBe("asset-out-old-base-happy",);
  });
});
