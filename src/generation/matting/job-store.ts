// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Matting — in-memory job store (persists until server restart).
 * Mirrors the emotion-avatar batch job store pattern.
 */
import type { MattingJob, MattingJobId, } from "./types";

/** In-memory job store. */
const activeJobs = new Map<MattingJobId, MattingJob>();

/**
 * Store a job in the in-memory store.
 * @param job
 */
export function storeJob(job: MattingJob,): void {
  activeJobs.set(job.id, job,);
}

/**
 * Get a matting job by id.
 * @param jobId
 */
export function getJob(jobId: MattingJobId,): MattingJob | undefined {
  return activeJobs.get(jobId,);
}

/**
 * List matting jobs for an owner, newest first.
 * @param ownerId
 */
export function listJobs(ownerId: string,): MattingJob[] {
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
  const job = activeJobs.get(jobId,);
  if (!job || job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return false;
  }

  job.status = "cancelled";
  job.completedAt = new Date().toISOString();
  job.error = "Cancelled by user";
  return true;
}
