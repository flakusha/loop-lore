// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for runBatchGeneration - batch loop, failure isolation, cancel, and
 * DB lifecycle records.
 *
 * ISOLATED-only: mock.module for ../../../config/load is process-global and
 * leaks across files without --isolate. Plain `bun test src/` skips this
 * file; `bun run check` / test:unit run with --isolate.
 */
import { beforeAll, expect, it, mock, } from "bun:test";
import type { Kysely, } from "kysely";
import * as realConfigLoad from "../../../config/load";
import { createConfigSchema, } from "../../../config/schema-class";
import { EMOTION_ORDINAL, EmotionType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, } from "../../../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import type { GenerationDispatchHandle, } from "./generation";
import { getGenerationJobRecord, } from "./job-records";
import { createJob, } from "./job-store";
import { isValidSeed, } from "./seed";
import type { BatchJobId, GenerateEmotionAvatarsOpts, } from "./types";

const FAKE_SD = {
  name: "test-sd-batch",
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

let runBatchGeneration: typeof import("./generation").runBatchGeneration;

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

  ({ runBatchGeneration, } = await import("./generation"));
}

/**
 * @param db
 * @param generateEmotionAvatar
 * @returns Stub dispatch handle with a scripted single-avatar generator.
 */
function makeSvc(
  db: Kysely<DB>,
  generateEmotionAvatar: GenerationDispatchHandle["generateEmotionAvatar"],
): GenerationDispatchHandle {
  return {
    db,
    avatarService: {},
    resolveEmotionPromptModifier: () => "smiling",
    generateEmotionAvatar,
  } as unknown as GenerationDispatchHandle;
}

describeOrSkip("runBatchGeneration", () => {
  let db: Kysely<DB>;
  const actorId = "actor-batch-gen";

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await insertActors(db, "Batch Gen Actor", { id: actorId, },);
  },);

  /**
   * @returns Minimal batch opts for the shared test actor.
   */
  function makeOpts(): GenerateEmotionAvatarsOpts {
    return { actorId, baseAvatarId: "avatar-base", };
  }

  it("completes every emotion and records a completed row", async () => {
    const svc = makeSvc(db, mock(async () => ({ avatarId: "av-1", assetId: "as-1", })),);
    const job = createJob({
      id: "job-batch-ok" as BatchJobId,
      actorId,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy, EmotionType.Sad,],
    },);

    await runBatchGeneration(svc, job, makeOpts(),);
    expect(job.status,).toBe("completed",);
    const record = await getGenerationJobRecord(db, job.id,);
    expect(record?.status,).toBe("completed",);
    expect(record?.results,).toHaveLength(2,);
    expect(record?.completedAt,).toBeDefined();
  });

  it("isolates per-emotion failures and records a failed row", async () => {
    let calls = 0;
    const svc = makeSvc(
      db,
      mock(async () => {
        calls += 1;
        if (calls === 2) {
          throw new Error("boom",);
        }

        return { avatarId: "av-1", assetId: "as-1", };
      },),
    );

    const job = createJob({
      id: "job-batch-partial" as BatchJobId,
      actorId,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy, EmotionType.Sad,],
    },);

    await runBatchGeneration(svc, job, makeOpts(),);
    expect(job.status,).toBe("failed",);
    expect(job.results.map((result,) => result.status),).toEqual(["completed", "failed",],);
    const record = await getGenerationJobRecord(db, job.id,);
    expect(record?.status,).toBe("failed",);
  });

  it("stops at the cancel boundary and records cancelled", async () => {
    let calls = 0;
    let jobRef: { status: string } | undefined;
    const svc = makeSvc(
      db,
      mock(async () => {
        calls += 1;
        // Simulate cancelJob() racing the batch: visible on next iteration.
        jobRef!.status = "cancelled";
        return { avatarId: "av-1", assetId: "as-1", };
      },),
    );

    const job = createJob({
      id: "job-batch-cancel" as BatchJobId,
      actorId,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy, EmotionType.Sad,],
    },);

    jobRef = job;
    await runBatchGeneration(svc, job, makeOpts(),);
    expect(calls,).toBe(1,);
    expect(job.results.map((result,) => result.status),).toEqual(["completed", "pending",],);
    const record = await getGenerationJobRecord(db, job.id,);
    expect(record?.status,).toBe("cancelled",);
    expect(job.completedAt,).toBeDefined();
  });

  it("pins an explicit base seed and derives a per-slot seed from it", async () => {
    const seen: Array<{ emotion: EmotionType; seed?: number }> = [];
    const svc = makeSvc(
      db,
      mock(async (opts,) => {
        seen.push({ emotion: opts.emotion, seed: opts.seed, },);
        return { avatarId: "av-1", assetId: "as-1", };
      },),
    );

    const job = createJob({
      id: "job-batch-seed" as BatchJobId,
      actorId,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy, EmotionType.Sad,],
    },);

    await runBatchGeneration(svc, job, { ...makeOpts(), seed: 4242, },);

    const slotSeeds = [
      4242 + EMOTION_ORDINAL[EmotionType.Happy],
      4242 + EMOTION_ORDINAL[EmotionType.Sad],
    ];

    expect(seen.map((entry,) => entry.seed),).toEqual(slotSeeds,);
    expect(job.seed,).toBe(4242,);

    const record = await getGenerationJobRecord(db, job.id,);
    expect(record?.payload.seed,).toBe(4242,);
    expect(record?.results.map((result,) => result.seed),).toEqual(slotSeeds,);
  });

  it("reuses the recorded base seed when the caller asks for it", async () => {
    const svc = makeSvc(db, mock(async () => ({ avatarId: "av-1", assetId: "as-1", })),);

    const first = createJob({
      id: "job-batch-seed-first" as BatchJobId,
      actorId,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy,],
    },);

    await runBatchGeneration(svc, first, { ...makeOpts(), seed: 777, },);

    const second = createJob({
      id: "job-batch-seed-reuse" as BatchJobId,
      actorId,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy,],
    },);

    await runBatchGeneration(svc, second, { ...makeOpts(), seedStrategy: "reuse", },);

    expect(second.seed,).toBe(777,);
  });

  it("reuse without a recorded seed falls back to a random base", async () => {
    const svc = makeSvc(db, mock(async () => ({ avatarId: "av-1", assetId: "as-1", })),);
    const job = createJob({
      id: "job-batch-seed-no-record" as BatchJobId,
      actorId,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy,],
    },);

    // An outfit scope with no prior job: reuse has nothing to reproduce, so
    // the batch must still run under a valid random base.
    await runBatchGeneration(svc, job, {
      ...makeOpts(),
      outfitId: "outfit-without-record",
      seedStrategy: "reuse",
    },);

    expect(isValidSeed(job.seed,),).toBe(true,);
  });

  it("an explicit seed wins over the reuse strategy", async () => {
    const svc = makeSvc(db, mock(async () => ({ avatarId: "av-1", assetId: "as-1", })),);
    const job = createJob({
      id: "job-batch-seed-explicit-wins" as BatchJobId,
      actorId,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy,],
    },);

    await runBatchGeneration(svc, job, {
      ...makeOpts(),
      seed: 31337,
      seedStrategy: "reuse",
    },);

    expect(job.seed,).toBe(31337,);
  });

  it("rejects an out-of-range explicit seed", async () => {
    const svc = makeSvc(db, mock(async () => ({ avatarId: "av-1", assetId: "as-1", })),);
    const job = createJob({
      id: "job-batch-seed-bad" as BatchJobId,
      actorId,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy,],
    },);

    await expect(runBatchGeneration(svc, job, { ...makeOpts(), seed: -1, },),).rejects.toThrow(/seed/,);
  });

  // Last: re-registers the process-global config mock with no providers.
  it("throws when no image provider is configured", async () => {
    mock.module("../../../config/load", () => ({
      ...realConfigLoad,
      loadConfig: () => ({
        ...structuredClone(createConfigSchema().defaults,),
        assets: { uploadDir: "/tmp", },
        generation: {
          ...structuredClone(createConfigSchema().defaults,).generation,
          providers: { sd: [], },
        },
      }),
    }),);

    const svc = makeSvc(db, mock(async () => ({ avatarId: "av-1", assetId: "as-1", })),);
    const job = createJob({
      id: "job-batch-noprov" as BatchJobId,
      actorId,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy,],
    },);

    await expect(runBatchGeneration(svc, job, makeOpts(),),).rejects.toThrow(
      "No image generation provider",
    );

    // Validation runs before the start is recorded: no row exists to strand.
    expect(job.status,).toBe("pending",);
    const record = await getGenerationJobRecord(db, job.id,);
    expect(record,).toBeUndefined();
  });

  // Last: invalid provider URL rejects before any row is recorded too.
  it("leaves no row when the provider URL is invalid", async () => {
    mock.module("../../../config/load", () => ({
      ...realConfigLoad,
      loadConfig: () => ({
        ...structuredClone(createConfigSchema().defaults,),
        assets: { uploadDir: "/tmp", },
        generation: {
          ...structuredClone(createConfigSchema().defaults,).generation,
          providers: { sd: [{ ...FAKE_SD, baseUrl: "notaurl", },], },
        },
      }),
    }),);

    const svc = makeSvc(db, mock(async () => ({ avatarId: "av-1", assetId: "as-1", })),);
    const job = createJob({
      id: "job-batch-badurl" as BatchJobId,
      actorId,
      baseAvatarId: "avatar-base",
      emotions: [EmotionType.Happy,],
    },);

    await expect(runBatchGeneration(svc, job, makeOpts(),),).rejects.toThrow(
      "Invalid image provider URL",
    );

    // Stillborn batch: rejected before any row was recorded.
    const record = await getGenerationJobRecord(db, job.id,);
    expect(record,).toBeUndefined();
  });
},);
