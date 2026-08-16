// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/services/emotion-avatar-service/job-store.ts — In-memory batch job store

import type { EmotionType, } from "../../../db/enums";
import type { BatchGenerationJob, BatchJobId, } from "./types";

/** In-memory job store (persists until server restart) */
const activeJobs = new Map<BatchJobId, BatchGenerationJob>();

/** Create a new batch job in "pending" state. */
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

/** Store a job in the in-memory store. */
export function storeJob(job: BatchGenerationJob,): void {
  activeJobs.set(job.id, job,);
}

/** Get a batch job by id. */
export function getJob(jobId: BatchJobId,): BatchGenerationJob | undefined {
  return activeJobs.get(jobId,);
}

/** List all batch jobs for an actor, newest first. */
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
 * Cancel a running batch generation job.
 *
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
