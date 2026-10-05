// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// In-process per-job progress pub/sub for emotion avatar batch generation.

import type { BatchGenerationJob, } from "./types";

/** Live progress snapshot for a single batch job. */
export interface JobProgress {
  jobId: string;
  done: number;
  total: number;
  status: string;
}

/** Progress listener. */
type JobProgressListener = (progress: JobProgress,) => void;

const listeners = new Map<string, Set<JobProgressListener>>();

/**
 * Subscribe to progress events for a batch job.
 * @param jobId
 * @param listener
 * @returns Unsubscribe function.
 */
export function subscribeJob(jobId: string, listener: JobProgressListener,): () => void {
  let set = listeners.get(jobId,);
  if (!set) {
    set = new Set();
    listeners.set(jobId, set,);
  }

  set.add(listener,);
  return () => {
    set.delete(listener,);
    if (set.size === 0) { listeners.delete(jobId,); }
  };
}

/**
 * Emit a progress snapshot to every subscriber of the job.
 * @param progress
 * @returns void
 */
export function emitJobProgress(progress: JobProgress,): void {
  const set = listeners.get(progress.jobId,);
  if (!set) { return; }
  for (const listener of Array.from(set,)) {
    try {
      listener(progress,);
    } catch {
      // A broken listener must not break the batch loop.
    }
  }
}

/**
 * Derive the progress snapshot for a job from its results.
 * Completed and failed variants both count as done.
 * @param job
 * @returns {JobProgress}
 */
export function jobProgress(job: BatchGenerationJob,): JobProgress {
  const results = job.results ?? [];
  const done = results.filter((r,) => r.status === "completed" || r.status === "failed").length;
  return { jobId: job.id, done, total: results.length, status: job.status, };
}
