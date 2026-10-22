// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for emotion-avatar-service/job-records.ts — DB-backed job lifecycle.
 */
import { describe, expect, test, } from "bun:test";
import { EmotionType, } from "../../../db/enums";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, } from "../../../test-utils/insert-helpers";
import {
  createGenerationJobRecord,
  findRecordedBaseSeed,
  getGenerationJobRecord,
  listGenerationJobRecords,
  recordBatchFinish,
  recordBatchStart,
  updateGenerationJobRecord,
} from "./job-records";
import { createJob, } from "./job-store";
import type { BatchJobId, } from "./types";
describe("generation job records", () => {
  test("create then get round-trips status and payload", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertActors(db, "Job Actor", { id: "actor-job-1", },);
      await createGenerationJobRecord(db, {
        id: "job-1",
        kind: "emotion-avatar",
        actorId: "actor-job-1",
        payload: { emotions: [EmotionType.Happy, EmotionType.Sad,], baseAvatarId: "av-1", },
        startedAt: "2026-09-11T00:00:00.000Z",
      },);

      const record = await getGenerationJobRecord(db, "job-1",);
      expect(record?.status,).toBe("running",);
      expect(record?.kind,).toBe("emotion-avatar",);
      expect(record?.payload.emotions,).toEqual(["happy", "sad",],);
      expect(record?.payload.baseAvatarId,).toBe("av-1",);
      expect(record?.results,).toEqual([],);
      expect(record?.completedAt,).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("update to completed persists results", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertActors(db, "Job Actor", { id: "actor-job-2", },);
      await createGenerationJobRecord(db, {
        id: "job-2",
        kind: "emotion-avatar",
        actorId: "actor-job-2",
        payload: { emotions: [EmotionType.Happy,], baseAvatarId: "av-2", },
        startedAt: "2026-09-11T00:00:00.000Z",
      },);

      await updateGenerationJobRecord(db, "job-2", {
        status: "completed",
        results: [{ emotion: EmotionType.Happy, status: "completed", avatarId: "av-new", assetId: "as-new", },],
        completedAt: "2026-09-11T00:01:00.000Z",
      },);

      const record = await getGenerationJobRecord(db, "job-2",);
      expect(record?.status,).toBe("completed",);
      expect(record?.results,).toHaveLength(1,);
      expect(record?.results[0]?.assetId,).toBe("as-new",);
      expect(record?.completedAt,).toBe("2026-09-11T00:01:00.000Z",);
    } finally {
      sqlite.close();
    }
  });

  test("list is actor-scoped and newest first; unknown id misses", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertActors(db, "List Actor", { id: "actor-list-1", },);
      await insertActors(db, "Other Actor", { id: "actor-list-2", },);
      for (const id of ["job-a", "job-b",]) {
        await createGenerationJobRecord(db, {
          id,
          kind: "emotion-avatar",
          actorId: "actor-list-1",
          payload: { emotions: [], baseAvatarId: "av-x", },
          startedAt: "2026-09-11T00:00:00.000Z",
        },);
      }

      await createGenerationJobRecord(db, {
        id: "job-c",
        kind: "emotion-avatar",
        actorId: "actor-list-2",
        payload: { emotions: [], baseAvatarId: "av-x", },
        startedAt: "2026-09-11T00:00:00.000Z",
      },);

      const listed = await listGenerationJobRecords(db, "actor-list-1",);
      expect(listed.map((record,) => record.id),).toEqual(["job-b", "job-a",],);
      expect(await getGenerationJobRecord(db, "job-nope",),).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });

  test("recordBatchStart mirrors the job as running; recordBatchFinish persists terminal state", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertActors(db, "Batch Actor", { id: "actor-batch-1", },);
      const job = createJob({
        id: "job-batch-1" as BatchJobId,
        actorId: "actor-batch-1",
        baseAvatarId: "av-base",
        emotions: [EmotionType.Happy, EmotionType.Sad,],
      },);

      await recordBatchStart(db, job, { actorId: "actor-batch-1", baseAvatarId: "av-base", },);
      const running = await getGenerationJobRecord(db, "job-batch-1",);
      expect(running?.status,).toBe("running",);
      expect(running?.payload.emotions,).toEqual([EmotionType.Happy, EmotionType.Sad,],);

      job.status = "completed";
      job.results[0]!.status = "completed";
      job.results[1]!.status = "completed";
      job.completedAt = "2026-09-11T00:02:00.000Z";
      await recordBatchFinish(db, job,);
      const done = await getGenerationJobRecord(db, "job-batch-1",);
      expect(done?.status,).toBe("completed",);
      expect(done?.completedAt,).toBe("2026-09-11T00:02:00.000Z",);
      expect(done?.results.every((result,) => result.status === "completed"),).toBe(true,);
    } finally {
      sqlite.close();
    }
  });

  test("recordBatchFinish stamps completedAt when the job has none (cancel path)", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertActors(db, "Batch Cancel Actor", { id: "actor-batch-2", },);
      const job = createJob({
        id: "job-batch-2" as BatchJobId,
        actorId: "actor-batch-2",
        baseAvatarId: "av-base",
        emotions: [EmotionType.Happy,],
      },);

      await recordBatchStart(db, job, { actorId: "actor-batch-2", baseAvatarId: "av-base", },);
      job.status = "cancelled";
      await recordBatchFinish(db, job,);
      const record = await getGenerationJobRecord(db, "job-batch-2",);
      expect(record?.status,).toBe("cancelled",);
      expect(record?.completedAt,).toBeDefined();
    } finally {
      sqlite.close();
    }
  });

  test("findRecordedBaseSeed returns the newest recorded seed in the scope", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      await insertActors(db, "Seed Actor", { id: "actor-seed-1", },);

      // A record without a seed (written before seed capture) is skipped.
      await createGenerationJobRecord(db, {
        id: "job-seed-none",
        kind: "emotion-avatar",
        actorId: "actor-seed-1",
        payload: { emotions: [], baseAvatarId: "av-x", },
        startedAt: "2026-09-11T00:00:00.000Z",
      },);

      await createGenerationJobRecord(db, {
        id: "job-seed-old",
        kind: "emotion-avatar",
        actorId: "actor-seed-1",
        payload: { emotions: [], baseAvatarId: "av-x", seed: 111, },
        startedAt: "2026-09-11T00:01:00.000Z",
      },);

      await createGenerationJobRecord(db, {
        id: "job-seed-new",
        kind: "emotion-avatar",
        actorId: "actor-seed-1",
        payload: { emotions: [], baseAvatarId: "av-x", seed: 222, },
        startedAt: "2026-09-11T00:02:00.000Z",
      },);

      // Outfit-scoped record — a different scope, so it never leaks into the
      // outfitless lookup.
      await createGenerationJobRecord(db, {
        id: "job-seed-outfit",
        kind: "emotion-avatar",
        actorId: "actor-seed-1",
        payload: { emotions: [], baseAvatarId: "av-x", outfitId: "outfit-1", seed: 333, },
        startedAt: "2026-09-11T00:03:00.000Z",
      },);

      expect(await findRecordedBaseSeed(db, "actor-seed-1",),).toBe(222,);
      expect(await findRecordedBaseSeed(db, "actor-seed-1", "outfit-1",),).toBe(333,);
      expect(await findRecordedBaseSeed(db, "actor-seed-1", "outfit-unknown",),).toBeUndefined();
      expect(await findRecordedBaseSeed(db, "actor-seed-unknown",),).toBeUndefined();
    } finally {
      sqlite.close();
    }
  });
});
