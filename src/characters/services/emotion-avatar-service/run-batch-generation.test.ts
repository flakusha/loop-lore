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
import { EmotionType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, } from "../../../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import type { GenerationDispatchHandle, } from "./generation";
import { getGenerationJobRecord, } from "./job-records";
import { createJob, } from "./job-store";
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
  });
},);
