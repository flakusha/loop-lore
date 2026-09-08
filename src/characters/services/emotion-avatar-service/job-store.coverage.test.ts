// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for the emotion-avatar batch job store
 * (src/characters/services/emotion-avatar-service/job-store.ts).
 *
 * Contract: create → store → get round-trip; list is actor-scoped and
 * newest-first; cancel only affects in-flight jobs and marks pending
 * results failed.
 */
import { describe, expect, test, } from "bun:test";
import { EmotionType, } from "../../../db/enums";
import { cancelJob, createJob, getJob, listJobs, storeJob, } from "./job-store";
import type { BatchJobId, } from "./types";

describe("emotion-avatar job store", () => {
  test("createJob builds a pending job with per-emotion pending results", () => {
    const job = createJob({
      id: "job-1" as BatchJobId,
      actorId: "actor-1",
      baseAvatarId: "avatar-1",
      emotions: [EmotionType.Happy, EmotionType.Sad, EmotionType.Angry,],
    },);
    expect(job.status,).toBe("pending",);
    expect(job.results.map((r,) => r.emotion),).toEqual(
      [EmotionType.Happy, EmotionType.Sad, EmotionType.Angry,],
    );
    expect(job.results.every((r,) => r.status === "pending"),).toBe(true,);
    expect(job.completedAt,).toBeUndefined();
  });

  test("store + get round-trips the job; unknown id returns undefined", () => {
    const job = createJob({
      id: "job-2" as BatchJobId,
      actorId: "actor-2",
      baseAvatarId: "avatar-2",
      emotions: [],
    },);
    storeJob(job,);
    expect(getJob("job-2" as BatchJobId,)?.id,).toBe("job-2" as BatchJobId,);
    expect(getJob("nope" as BatchJobId,),).toBeUndefined();
  });

  test("listJobs is actor-scoped and newest first", () => {
    const older = createJob({
      id: "job-old" as BatchJobId,
      actorId: "actor-list",
      baseAvatarId: "a",
      emotions: [],
    },);
    older.startedAt = "2026-01-01T00:00:00Z";
    const newer = createJob({
      id: "job-new" as BatchJobId,
      actorId: "actor-list",
      baseAvatarId: "a",
      emotions: [],
    },);
    newer.startedAt = "2026-02-01T00:00:00Z";
    storeJob(older,);
    storeJob(newer,);

    const jobs = listJobs("actor-list",);
    expect(jobs.map((j,) => j.id),).toEqual(["job-new", "job-old",] as BatchJobId[],);
    expect(listJobs("actor-none",),).toEqual([],);
  });

  test("cancelJob flips a pending job to cancelled and fails pending results", () => {
    const job = createJob({
      id: "job-cancel" as BatchJobId,
      actorId: "actor-3",
      baseAvatarId: "a",
      emotions: [EmotionType.Happy, EmotionType.Sad,],
    },);
    job.results[0]!.status = "completed";
    storeJob(job,);

    expect(cancelJob("job-cancel" as BatchJobId,),).toBe(true,);
    const cancelled = getJob("job-cancel" as BatchJobId,)!;
    expect(cancelled.status,).toBe("cancelled",);
    expect(cancelled.completedAt,).toBeTruthy();
    // Already-completed result untouched; pending one failed with reason.
    expect(cancelled.results[0]?.status,).toBe("completed",);
    expect(cancelled.results[1]?.status,).toBe("failed",);
    expect(cancelled.results[1]?.error,).toBe("Cancelled by user",);

    // Second cancel on the cancelled job returns false.
    expect(cancelJob("job-cancel" as BatchJobId,),).toBe(false,);
    expect(cancelJob("missing" as BatchJobId,),).toBe(false,);
  });

  test("completed and failed jobs cannot be cancelled", () => {
    for (const status of ["completed", "failed",] as const) {
      const job = createJob({
        id: `job-${status}` as BatchJobId,
        actorId: "actor-4",
        baseAvatarId: "a",
        emotions: [],
      },);
      job.status = status;
      storeJob(job,);
      expect(cancelJob(`job-${status}` as BatchJobId,),).toBe(false,);
    }
  });
});
