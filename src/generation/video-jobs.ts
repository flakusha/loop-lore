// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Video generation — in-memory async job store (persists until restart).
 * Mirrors src/generation/matting/job-store.ts: submit returns a job id
 * immediately, the render settles the job in the background, and the
 * client polls by id. Ownership is checked by the route, not here.
 *
 * Bounded: the store caps at VIDEO_JOB_STORE_MAX entries. Storing past the
 * cap evicts the oldest SETTLED job (done/failed — never a pending one, so
 * a queued render is never dropped to make room). When every entry is still
 * pending, the oldest pending entry is dropped instead — the cap is a
 * memory bound, not a queue, and unbounded growth under a burst would be the
 * worse failure. Settled eviction keeps the poll window for recent jobs
 * while a restart clears everything anyway (durable state is out of scope).
 */
import type { VideoProviderConfig, } from "../config/schema";
import type { VideoGenRequest, } from "./video-engine";

/** Terminal-pending lifecycle of one video render. */
export type VideoJobStatus = "pending" | "done" | "failed";

/** Max entries in the in-memory job store. Past it, settled jobs evict oldest-first. */
export const VIDEO_JOB_STORE_MAX = 500;

/** Persisted clip reference reported on a done job. */
export interface VideoJobAsset {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  provider: string;
}

/** One async video render: inputs needed by the background continuation. */
export interface VideoJob {
  id: string;
  ownerId: string;
  status: VideoJobStatus;
  request: VideoGenRequest;
  chatId?: string;
  messageId?: string;
  /** Provider list snapshot — the background render uses this, not live config. */
  providers: VideoProviderConfig[];
  /** Epoch ms after which the job reports failed/504 (poll + late resolve). */
  deadline: number;
  createdAt: number;
  completedAt?: number;
  asset?: VideoJobAsset;
  error?: string;
  errorStatus?: number;
}

/** In-memory job store. */
const videoJobs = new Map<string, VideoJob>();

/**
 * Evict down to the cap after an insert: oldest settled first, oldest
 * pending only when nothing settled remains.
 * @returns {void}
 */
function evictPastCap(): void {
  while (videoJobs.size > VIDEO_JOB_STORE_MAX) {
    let victim: string | undefined;
    for (const [id, job,] of videoJobs) {
      if (job.status !== "pending") {
        victim = id;
        break;
      }
    }

    if (victim === undefined) {
      victim = videoJobs.keys().next().value;
      if (victim === undefined) { return; }
    }

    videoJobs.delete(victim,);
  }
}

/**
 * Store a video job in the in-memory store.
 * @param job - the pending job to track
 * @returns {void}
 */
export function storeVideoJob(job: VideoJob,): void {
  videoJobs.delete(job.id,);
  videoJobs.set(job.id, job,);
  evictPastCap();
}

/**
 * Get a video job by id.
 * @param jobId - the job id from the submit response
 * @returns {VideoJob | undefined}
 */
export function getVideoJob(jobId: string,): VideoJob | undefined {
  return videoJobs.get(jobId,);
}

/**
 * List video jobs for an owner, newest first.
 * @param ownerId - the submitting user
 * @returns {VideoJob[]}
 */
export function listVideoJobs(ownerId: string,): VideoJob[] {
  const jobs: VideoJob[] = [];
  for (const job of videoJobs.values()) {
    if (job.ownerId === ownerId) {
      jobs.push(job,);
    }
  }

  return jobs.sort((a, b,) => b.createdAt - a.createdAt);
}

/**
 * Mark a pending video job done with its persisted asset.
 * @param jobId - the job to complete
 * @param asset - the persisted clip reference
 * @returns true when the job was pending and is now done
 */
export function completeVideoJob(jobId: string, asset: VideoJobAsset,): boolean {
  const job = videoJobs.get(jobId,);
  if (!job || job.status !== "pending") { return false; }

  job.status = "done";
  job.asset = asset;
  job.completedAt = Date.now();
  return true;
}

/**
 * Mark a pending video job failed.
 * @param jobId - the job to fail
 * @param error - human-readable failure
 * @param errorStatus - numeric code reported on poll (502 engine, 504 timeout, 500 persist)
 * @returns true when the job was pending and is now failed
 */
export function failVideoJob(jobId: string, error: string, errorStatus: number,): boolean {
  const job = videoJobs.get(jobId,);
  if (!job || job.status !== "pending") { return false; }

  job.status = "failed";
  job.error = error;
  job.errorStatus = errorStatus;
  job.completedAt = Date.now();
  return true;
}

/**
 * Clear the store (tests only).
 * @returns {void}
 */
export function __resetVideoJobsForTests(): void {
  videoJobs.clear();
}
