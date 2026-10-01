// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the emotion-avatar job progress pub/sub
 * (src/characters/services/emotion-avatar-service/job-events.ts).
 *
 * Contract: jobProgress derives done/total from results (completed and failed
 * both count as done); subscribeJob/emitJobProgress deliver per job;
 * unsubscribe stops delivery; unknown jobs and throwing listeners are inert.
 */
import { describe, expect, test, } from "bun:test";
import { EmotionType, } from "../../../db/enums";
import { emitJobProgress, jobProgress, subscribeJob, } from "./job-events";
import { createJob, } from "./job-store";
import type { BatchJobId, } from "./types";

describe("emotion-avatar job events", () => {
  test("jobProgress derives done/total from results", () => {
    const job = createJob({
      id: "job-progress" as BatchJobId,
      actorId: "actor-1",
      baseAvatarId: "av-1",
      emotions: [EmotionType.Happy, EmotionType.Sad, EmotionType.Angry,],
    },);
    expect(jobProgress(job,),).toEqual(
      { jobId: "job-progress", done: 0, total: 3, status: "pending", },
    );

    job.results[0]!.status = "completed";
    job.results[1]!.status = "failed";
    job.status = "running";
    expect(jobProgress(job,),).toEqual(
      { jobId: "job-progress", done: 2, total: 3, status: "running", },
    );

    job.results[2]!.status = "completed";
    job.status = "completed";
    expect(jobProgress(job,),).toEqual(
      { jobId: "job-progress", done: 3, total: 3, status: "completed", },
    );
  });

  test("subscribeJob delivers emitJobProgress to the job's listeners", () => {
    const seen: unknown[] = [];
    const unsubscribe = subscribeJob("job-1", (progress,) => seen.push(progress,),);
    emitJobProgress({ jobId: "job-1", done: 1, total: 2, status: "running", },);
    expect(seen,).toEqual([{ jobId: "job-1", done: 1, total: 2, status: "running", },],);
    unsubscribe();
  });

  test("unsubscribe stops delivery; subscriptions are per-job", () => {
    const seen: string[] = [];
    const offA = subscribeJob("job-2", (p,) => seen.push(`a:${p.done}`,),);
    subscribeJob("job-2", (p,) => seen.push(`b:${p.done}`,),);
    emitJobProgress({ jobId: "job-2", done: 1, total: 2, status: "running", },);
    expect(seen,).toEqual(["a:1", "b:1",],);

    offA();
    emitJobProgress({ jobId: "job-2", done: 2, total: 2, status: "completed", },);
    expect(seen,).toEqual(["a:1", "b:1", "b:2",],);

    const other: string[] = [];
    subscribeJob("job-3", (p,) => other.push(String(p.done,),),);
    emitJobProgress({ jobId: "job-2", done: 3, total: 3, status: "failed", },);
    expect(other,).toEqual([],);
  });

  test("emitJobProgress ignores unknown jobs and listener throws", () => {
    expect(() => emitJobProgress({ jobId: "missing", done: 0, total: 0, status: "pending", },)).not.toThrow();
    subscribeJob("job-4", () => {
      throw new Error("boom",);
    },);
    expect(() => emitJobProgress({ jobId: "job-4", done: 1, total: 1, status: "completed", },)).not.toThrow();
  });
});
