// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Slot-replace semantics for actor-level (outfitless) emotion-avatar
 * regeneration — the path behind POST /actors/:actorId/emotion-avatars/regenerate
 * with replace: "slot" | "append".
 *
 * Reuses the shared batch machinery (runBatchGeneration +
 * deleteOutfitEmotionVariants) with outfitId undefined, pinning that a base
 * re-roll never reaches into outfit slots and that a failed re-roll keeps the
 * previous variant bound (no avatar-less window).
 *
 * ISOLATED-only: mock.module for ../../../config/load is process-global and
 * leaks across files without --isolate.
 */
import { beforeAll, expect, it, mock, } from "bun:test";
import type { Kysely, } from "kysely";
import * as realConfigLoad from "../../../config/load";
import { createConfigSchema, } from "../../../config/schema-class";
import { EmotionType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { AvatarService, } from "../avatar-service";
import { createTestActors, } from "../test-helpers";
import type { GenerationDispatchHandle, } from "./generation";
import { runBatchGeneration, } from "./generation";
import { createJob, } from "./job-store";
import type { BatchJobId, GenerateEmotionAvatarsOpts, } from "./types";

const FAKE_SD = {
  name: "test-sd-regen",
  label: "Test SD",
  baseUrl: "http://127.0.0.1:7860",
  apiFamily: "sdcpp",
  purpose: "generate",
  timeout: 5000,
  generationTimeout: 30_000,
  defaults: {
    width: 512,
    height: 512,
    steps: 20,
    cfgScale: 7,
    sampler: "euler",
  },
};

if (ISOLATED) {
  mock.module("../../../config/load", () => ({
    ...realConfigLoad,
    loadConfig: () => ({
      ...structuredClone(createConfigSchema().defaults,),
      assets: { uploadDir: "/tmp", },
      generation: {
        ...structuredClone(createConfigSchema().defaults,).generation,
        providers: { sd: [FAKE_SD,], },
      },
    }),
  }),);
}

const ACTOR = "actor-regen-outfitless";
const OUTFIT = "outfit-armor";

/** Recorded generated avatar ids per emotion, for exceptAvatarId wiring. */
let generateImpl: (emotion: string,) => Promise<{ avatarId: string; assetId: string }>;

/**
 * @param db
 * @returns Dispatch handle with a real AvatarService and scripted generator.
 */
function makeSvc(db: Kysely<DB>,): GenerationDispatchHandle {
  return {
    db,
    avatarService: new AvatarService(db,),
    resolveEmotionPromptModifier: () => "smiling",
    generateEmotionAvatar: (genOpts: Parameters<GenerationDispatchHandle["generateEmotionAvatar"]>[0],) =>
      generateImpl(genOpts.emotion,),
  } as unknown as GenerationDispatchHandle;
}

/**
 * @param opts
 * @returns Batch opts for the shared actor, replace per the endpoint mapping.
 */
function makeOpts(opts: { replace?: boolean; emotions?: EmotionType[] } = {},): GenerateEmotionAvatarsOpts {
  return {
    actorId: ACTOR,
    baseAvatarId: "avatar-base",
    outfitId: undefined,
    replace: opts.replace,
    emotions: opts.emotions ?? [EmotionType.Happy,],
  };
}

describeOrSkip("actor-level (outfitless) regenerate slot semantics", () => {
  let db: Kysely<DB>;
  let avatars: AvatarService;
  let svc: GenerationDispatchHandle;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await createTestActors(db, ACTOR,);
    const now = new Date().toISOString();
    await db.insertInto("wardrobe_items",).values({
      id: OUTFIT,
      actor_id: ACTOR,
      world_id: null,
      name: "Armor",
      descriptor: "",
      tags: "[]",
      sort_order: 0,
      created_at: now,
      updated_at: now,
    },).execute();

    avatars = new AvatarService(db,);
    svc = makeSvc(db,);

    await db.insertInto("assets",).values([
      "old-happy-base",
      "old-sad-base",
      "old-happy-armor",
      "fresh-happy-base",
    ].map((name,) => ({
      id: `asset-${name}`,
      owner_id: "test-user",
      filename: `${name}.png`,
      mime_type: "image/png",
      asset_type: "image",
      size_bytes: 1024,
      storage_path: `/test/${name}.png`,
      storage_backend: "local",
      visibility: "private",
    })),).execute();
  },);

  it("slot replace re-points the base slot and never touches siblings or outfit slots", async () => {
    const oldHappyBase = await avatars.createAvatar({
      actorId: ACTOR,
      assetId: "asset-old-happy-base",
      label: "old happy base",
      tags: { emotion: EmotionType.Happy, },
    },);

    const oldSadBase = await avatars.createAvatar({
      actorId: ACTOR,
      assetId: "asset-old-sad-base",
      label: "old sad base",
      tags: { emotion: EmotionType.Sad, },
    },);

    const oldHappyArmor = await avatars.createAvatar({
      actorId: ACTOR,
      assetId: "asset-old-happy-armor",
      label: "old happy armor",
      tags: { emotion: EmotionType.Happy, },
      outfitId: OUTFIT,
    },);

    generateImpl = async () => ({
      avatarId: await avatars.createAvatar({
        actorId: ACTOR,
        assetId: "asset-fresh-happy-base",
        label: "fresh happy base",
        tags: { emotion: EmotionType.Happy, },
      },),
      assetId: "asset-fresh-happy-base",
    });

    const job = createJob({
      id: "job-regen-slot" as BatchJobId,
      actorId: ACTOR,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy,],
    },);

    await runBatchGeneration(svc, job, makeOpts({ replace: true, },),);

    expect(job.status,).toBe("completed",);
    // Old base happy variant cleaned up…
    expect(await avatars.getAvatar(oldHappyBase,),).toBeUndefined();
    // …sibling base emotions untouched…
    expect((await avatars.getAvatar(oldSadBase,))?.outfitId ?? null,).toBeNull();
    // …outfit slots never in scope…
    expect(await avatars.getAvatar(oldHappyArmor,),).toBeDefined();
    // …and the fresh variant holds the (happy, base) binding.
    const fresh = job.results[0]?.avatarId;
    expect(fresh,).toBeDefined();
    expect((await avatars.getAvatar(fresh as string,))?.tags.emotion,).toBe(EmotionType.Happy,);
    expect((await avatars.getAvatar(fresh as string,))?.outfitId ?? null,).toBeNull();
  });

  it("failed re-roll keeps the previous variant bound", async () => {
    const oldHappyBase = await avatars.createAvatar({
      actorId: ACTOR,
      assetId: "asset-old-happy-base",
      label: "still-bound happy base",
      tags: { emotion: EmotionType.Happy, },
    },);

    generateImpl = async () => {
      throw new Error("provider down",);
    };

    const job = createJob({
      id: "job-regen-failed" as BatchJobId,
      actorId: ACTOR,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy,],
    },);

    await runBatchGeneration(svc, job, makeOpts({ replace: true, },),);

    expect(job.status,).toBe("failed",);
    expect(job.results[0]?.status,).toBe("failed",);
    // No avatar-less window: the previous variant is still the bound one.
    expect(await avatars.getAvatar(oldHappyBase,),).toBeDefined();
  });

  it("append mode adds variants without unbinding existing slots", async () => {
    const existing = await avatars.createAvatar({
      actorId: ACTOR,
      assetId: "asset-old-happy-base",
      label: "append-kept happy base",
      tags: { emotion: EmotionType.Happy, },
    },);

    generateImpl = async () => ({
      avatarId: await avatars.createAvatar({
        actorId: ACTOR,
        assetId: "asset-fresh-happy-base",
        label: "appended happy base",
        tags: { emotion: EmotionType.Happy, },
      },),
      assetId: "asset-fresh-happy-base",
    });

    const job = createJob({
      id: "job-regen-append" as BatchJobId,
      actorId: ACTOR,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy,],
    },);

    await runBatchGeneration(svc, job, makeOpts({ replace: undefined, },),);

    expect(job.status,).toBe("completed",);
    expect(await avatars.getAvatar(existing,),).toBeDefined();
    expect(job.results[0]?.avatarId,).not.toBe(existing,);
  });
},);
