// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the video in-memory job store: store/get, per-owner
 * listing (newest first), and the terminal transitions (done/failed) that
 * only apply while a job is still pending.
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import type { VideoProviderConfig, } from "../config/schema";
import {
  __resetVideoJobsForTests,
  completeVideoJob,
  failVideoJob,
  getVideoJob,
  listVideoJobs,
  storeVideoJob,
  type VideoJob,
  type VideoJobAsset,
} from "./video-jobs";

const ASSET: VideoJobAsset = {
  id: "asset-1",
  url: "/api/v1/assets/asset-1/raw",
  filename: "clip.mp4",
  mimeType: "video/mp4",
  provider: "video-test-provider",
};

/** A pending job owned by `ownerId`. */
function pendingJob(id: string, ownerId: string, createdAt: number,): VideoJob {
  return {
    id,
    ownerId,
    status: "pending",
    request: { prompt: "a cat", },
    providers: [] as VideoProviderConfig[],
    deadline: createdAt + 60_000,
    createdAt,
  };
}

beforeEach(() => {
  __resetVideoJobsForTests();
},);

describe("video job store", () => {
  test("storeVideoJob and getVideoJob round-trip a job", () => {
    storeVideoJob(pendingJob("job-1", "owner-1", 1,),);
    expect(getVideoJob("job-1",)?.ownerId,).toBe("owner-1",);
    expect(getVideoJob("missing",),).toBeUndefined();
  });

  test("listVideoJobs filters by owner and sorts newest first", () => {
    storeVideoJob(pendingJob("job-old", "owner-1", 10,),);
    storeVideoJob(pendingJob("job-new", "owner-1", 20,),);
    storeVideoJob(pendingJob("job-other", "owner-2", 30,),);

    expect(listVideoJobs("owner-1",).map((job,) => job.id),).toEqual(["job-new", "job-old",],);
    expect(listVideoJobs("owner-2",).map((job,) => job.id),).toEqual(["job-other",],);
    expect(listVideoJobs("owner-none",),).toEqual([],);
  });

  test("completeVideoJob marks a pending job done with its asset", () => {
    storeVideoJob(pendingJob("job-1", "owner-1", 1,),);
    expect(completeVideoJob("job-1", ASSET,),).toBe(true,);

    const job = getVideoJob("job-1",);
    expect(job?.status,).toBe("done",);
    expect(job?.asset,).toEqual(ASSET,);
    expect(job?.completedAt,).toBeGreaterThan(0,);
  });

  test("completeVideoJob refuses unknown or already-settled jobs", () => {
    expect(completeVideoJob("missing", ASSET,),).toBe(false,);

    storeVideoJob(pendingJob("job-1", "owner-1", 1,),);
    completeVideoJob("job-1", ASSET,);
    expect(completeVideoJob("job-1", ASSET,),).toBe(false,);
  });

  test("failVideoJob records the error and its status code", () => {
    storeVideoJob(pendingJob("job-1", "owner-1", 1,),);
    expect(failVideoJob("job-1", "engine exploded", 502,),).toBe(true,);

    const job = getVideoJob("job-1",);
    expect(job?.status,).toBe("failed",);
    expect(job?.error,).toBe("engine exploded",);
    expect(job?.errorStatus,).toBe(502,);
  });

  test("failVideoJob refuses unknown or already-settled jobs", () => {
    expect(failVideoJob("missing", "boom", 500,),).toBe(false,);

    storeVideoJob(pendingJob("job-1", "owner-1", 1,),);
    failVideoJob("job-1", "boom", 500,);
    expect(failVideoJob("job-1", "boom", 500,),).toBe(false,);
  });
});
