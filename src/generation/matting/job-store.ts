// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting — in-memory job store (persists until server restart).
 * Mirrors the emotion-avatar batch job store pattern.
 */
import { parseExpiryMs, } from "../../utils/date";
import type { MattingJob, MattingJobId, } from "./types";

/** In-memory job store. Terminal jobs evict via TTL + cap (see pruneJobs). */
const activeJobs = new Map<MattingJobId, MattingJob>();

/** How long a finished job stays in memory (generous: pollers read 404 after). */
const JOB_TTL_MS = 30 * 60 * 1000;
/** Hard cap on retained jobs; the oldest finished jobs are evicted first. */
const MAX_JOBS = 100;

/**
 * Evict finished jobs past the TTL and bound the map size (the
 * src/routes/export-sse/jobs.ts pruneJobs pattern). Runs without timers, on
 * the store's read/write paths. Terminal jobs are also reflected on the
 * asset's alpha_status column, so a 404 after eviction reads as done rather
 * than a retry loop.
 * @param now - current time (injectable for tests)
 */
function pruneJobs(now = new Date(),): void {
  const cutoff = now.getTime() - JOB_TTL_MS;
  for (const [id, job,] of activeJobs) {
    const completed = parseExpiryMs(job.completedAt,);
    if (completed !== null && completed < cutoff) {
      activeJobs.delete(id,);
    }
  }

  while (activeJobs.size > MAX_JOBS) {
    let oldestId: MattingJobId | undefined;
    let oldestAt = Infinity;
    for (const [id, job,] of activeJobs) {
      const at = parseExpiryMs(job.completedAt,) ?? Infinity;
      if (at < oldestAt) {
        oldestAt = at;
        oldestId = id;
      }
    }

    if (oldestId === undefined) { break; }
    activeJobs.delete(oldestId,);
  }
}

/**
 * Store a job in the in-memory store.
 * @param job
 * @returns {void}
 */
export function storeJob(job: MattingJob,): void {
  pruneJobs();
  activeJobs.set(job.id, job,);
}

/**
 * Get a matting job by id.
 * @param jobId
 * @returns {MattingJob | undefined}
 */
export function getJob(jobId: MattingJobId,): MattingJob | undefined {
  pruneJobs();
  return activeJobs.get(jobId,);
}

/**
 * List matting jobs for an owner, newest first.
 * @param ownerId
 * @returns {MattingJob[]}
 */
export function listJobs(ownerId: string,): MattingJob[] {
  pruneJobs();
  const jobs: MattingJob[] = [];
  for (const job of activeJobs.values()) {
    if (job.ownerId === ownerId) {
      jobs.push(job,);
    }
  }

  return jobs.sort((a, b,) => b.startedAt.localeCompare(a.startedAt,));
}

/**
 * Cancel a pending/running matting job.
 * @param jobId
 * @returns true if cancelled, false if not found or already finished
 */
export function cancelJob(jobId: MattingJobId,): boolean {
  pruneJobs();
  const job = activeJobs.get(jobId,);
  if (!job || job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return false;
  }

  job.status = "cancelled";
  job.completedAt = new Date().toISOString();
  job.error = "Cancelled by user";
  return true;
}
