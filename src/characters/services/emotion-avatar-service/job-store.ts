// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// In-memory batch job store for emotion avatar generation.

import type { EmotionType, } from "../../../db/enums";
import { toDate, } from "../../../utils/date";
import type { GenerationJobRecord, } from "./job-records";
import type { BatchGenerationJob, BatchJobId, } from "./types";

/** In-memory job store (persists until server restart) */
const activeJobs = new Map<BatchJobId, BatchGenerationJob>();

/**
 * Create a new batch job in "pending" state.
 * @param opts
 * @param opts.id
 * @param opts.actorId
 * @param opts.baseAvatarId
 * @param opts.emotions
 * @returns void
 */
export function createJob(opts: {
  id: BatchJobId;
  actorId: string;
  baseAvatarId: string;
  emotions: EmotionType[];
},): BatchGenerationJob {
  return {
    id: opts.id,
    actorId: opts.actorId,
    baseAvatarId: opts.baseAvatarId,
    status: "pending",
    results: Array.from(opts.emotions, (emotion,) => ({
      emotion,
      status: "pending" as const,
    }),),
    startedAt: new Date().toISOString(),
  };
}

/**
 * Store a job in the in-memory store.
 * @param job
 * @returns void
 */
export function storeJob(job: BatchGenerationJob,): void {
  activeJobs.set(job.id, job,);
}

/**
 * Get a batch job by id.
 * @param jobId
 * @returns void
 */
export function getJob(jobId: BatchJobId,): BatchGenerationJob | undefined {
  return activeJobs.get(jobId,);
}

/**
 * List all batch jobs for an actor, newest first.
 * @param actorId
 * @returns void
 */
export function listJobs(actorId: string,): BatchGenerationJob[] {
  const jobs: BatchGenerationJob[] = [];
  for (const job of activeJobs.values()) {
    if (job.actorId === actorId) {
      jobs.push(job,);
    }
  }

  return jobs.sort((a, b,) => b.startedAt.localeCompare(a.startedAt,));
}

/**
 * Rebuild the in-memory cache from durable job records (startup path).
 *
 * The store stays a cache over `generation_jobs`: after a restart every
 * emotion-avatar record — reconciled-interrupted ones included — is loaded
 * back so job list/status surfaces serve durable state, never an empty or
 * zombie-`running` view.
 * @param records
 * @returns void
 */
export function rebuildJobCache(records: GenerationJobRecord[],): void {
  for (const record of records) {
    activeJobs.set(record.id as BatchJobId, {
      id: record.id as BatchJobId,
      actorId: record.actorId,
      baseAvatarId: record.payload.baseAvatarId,
      status: record.status,
      results: record.results,
      ...(record.payload.seed !== undefined ? { seed: record.payload.seed, } : {}),
      startedAt: record.startedAt ?? toDate(0,).toISOString(),
      ...(record.completedAt !== null ? { completedAt: record.completedAt, } : {}),
      ...(record.errorMessage !== null ? { error: record.errorMessage, } : {}),
    },);
  }
}

/**
 * Cancel a running batch generation job.
 * @param jobId - Batch job ID
 * @returns true if cancelled, false if not found or already completed
 */
export function cancelJob(jobId: BatchJobId,): boolean {
  const job = activeJobs.get(jobId,);
  if (!job || job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return false;
  }

  job.status = "cancelled";
  job.completedAt = new Date().toISOString();

  // Mark pending results as failed
  for (const result of job.results) {
    if (!(result.status === "pending" || result.status === "generating")) {
      continue;
    }

    result.status = "failed";
    result.error = "Cancelled by user";
  }

  return true;
}
