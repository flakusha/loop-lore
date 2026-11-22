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
  deferVideoJob,
  failVideoJob,
  getVideoJob,
  listDueVideoJobs,
  listVideoJobs,
  markVideoJobRetried,
  resumeVideoJob,
  storeVideoJob,
  VIDEO_JOB_STORE_MAX,
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

  test("store stays bounded under a burst: settled jobs evict oldest-first", () => {
    for (let i = 0; i < VIDEO_JOB_STORE_MAX + 50; i += 1) {
      const id = `burst-${i}`;
      storeVideoJob(pendingJob(id, "owner-1", i,),);
      completeVideoJob(id, ASSET,);
    }

    expect(listVideoJobs("owner-1",).length,).toBe(VIDEO_JOB_STORE_MAX,);
    // Oldest settled evicted; newest retained.
    expect(getVideoJob("burst-0",),).toBeUndefined();
    expect(getVideoJob(`burst-${VIDEO_JOB_STORE_MAX + 49}`,),).toBeDefined();
  });

  test("store never evicts a pending job while a settled one remains", () => {
    storeVideoJob(pendingJob("keep-pending", "owner-1", 0,),);
    for (let i = 0; i < VIDEO_JOB_STORE_MAX; i += 1) {
      const id = `settled-${i}`;
      storeVideoJob(pendingJob(id, "owner-1", i + 1,),);
      completeVideoJob(id, ASSET,);
    }

    expect(getVideoJob("keep-pending",),).toBeDefined();
    expect(listVideoJobs("owner-1",).length,).toBe(VIDEO_JOB_STORE_MAX,);
  });

  test("deferVideoJob parks a pending job, extends its deadline and stays idempotent", () => {
    const job = pendingJob("job-defer", "owner-1", 1,);
    storeVideoJob(job,);
    const scheduledFor = Date.now() + 60_000;
    const deadlineBefore = job.deadline;
    const before = Date.now();

    expect(deferVideoJob("job-defer", "owner-2", scheduledFor,),).toBe(false,);
    expect(job.deferred,).toBeUndefined();

    expect(deferVideoJob("job-defer", "owner-1", scheduledFor,),).toBe(true,);
    const after = Date.now();
    expect(job.deferred,).toBe(true,);
    expect(job.scheduledFor,).toBe(scheduledFor,);
    expect(job.deadline - deadlineBefore,).toBeLessThanOrEqual(scheduledFor - before,);
    expect(job.deadline - deadlineBefore,).toBeGreaterThanOrEqual(scheduledFor - after,);

    expect(deferVideoJob("job-defer", "owner-1", scheduledFor + 5_000,),).toBe(false,);
    expect(job.scheduledFor,).toBe(scheduledFor,);

    const settled = pendingJob("job-settled", "owner-1", 2,);
    storeVideoJob(settled,);
    completeVideoJob("job-settled", ASSET,);
    expect(deferVideoJob("job-settled", "owner-1", scheduledFor,),).toBe(false,);
  });

  test("listDueVideoJobs returns only deferred pending jobs due at the given time", () => {
    for (const id of ["due", "later", "resumed", "foreign", "settled",]) {
      storeVideoJob(pendingJob(id, id === "foreign" ? "owner-2" : "owner-1", 1,),);
    }

    deferVideoJob("due", "owner-1", 1_000,);
    deferVideoJob("later", "owner-1", 2_000,);
    deferVideoJob("resumed", "owner-1", 500,);
    resumeVideoJob("resumed", "owner-1",);
    deferVideoJob("foreign", "owner-2", 1_500,);
    deferVideoJob("settled", "owner-1", 900,);
    completeVideoJob("settled", ASSET,);

    expect(listDueVideoJobs(1_000,).map((job,) => job.id),).toEqual(["due",],);
    expect(listDueVideoJobs(1_500,).map((job,) => job.id).sort(),).toEqual(["due", "foreign",],);
    expect(listDueVideoJobs(0,),).toEqual([],);
  });

  test("resumeVideoJob clears a deferral only for the owning user", () => {
    const job = pendingJob("job-resume", "owner-1", 1,);
    storeVideoJob(job,);
    deferVideoJob("job-resume", "owner-1", Date.now() + 60_000,);

    expect(resumeVideoJob("job-missing", "owner-1",),).toBe(false,);
    expect(resumeVideoJob("job-resume", "owner-2",),).toBe(false,);
    expect(job.deferred,).toBe(true,);

    expect(resumeVideoJob("job-resume", "owner-1",),).toBe(true,);
    expect(job.deferred,).toBe(false,);
    expect(job.scheduledFor,).toBeNull();
    expect(resumeVideoJob("job-resume", "owner-1",),).toBe(false,);
  });

  test("markVideoJobRetried records the replacement id only for the owner", () => {
    const job = pendingJob("job-retry", "owner-1", 1,);
    storeVideoJob(job,);

    markVideoJobRetried("job-retry", "owner-2", "foreign-retry",);
    expect(job.retryOf,).toBeUndefined();
    markVideoJobRetried("job-retry", "owner-1", "retry-1",);
    expect(job.retryOf,).toBe("retry-1",);
    expect(() => markVideoJobRetried("missing", "owner-1", "retry-2",)).not.toThrow();
  });
});
