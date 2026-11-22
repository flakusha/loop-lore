// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chain run jobs — in-memory store mirroring the matting/emotion-avatar
 * pattern (persists until server restart; status polling reads live state).
 */
import { uid, } from "../../utils";
import { parseExpiryMs, } from "../../utils/date";

/** Lifecycle of one chain run. */
export type ChainRunStatus = "pending" | "running" | "completed" | "failed";

/** One chain run, pollable by its owner. */
export interface ChainRunJob {
  id: string;
  ownerId: string;
  chainId: string;
  status: ChainRunStatus;
  totalSteps: number;
  completedSteps: number;
  /** Per-step handler responses, in execution order. */
  results: unknown[];
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

const activeJobs = new Map<string, ChainRunJob>();

/** How long a finished run stays in memory (generous: pollers read 404 after). */
const RUN_TTL_MS = 30 * 60 * 1000;
/** Hard cap on retained runs; the oldest finished runs are evicted first. */
const MAX_RUNS = 100;

/**
 * Evict finished runs past the TTL and bound the map size (the
 * src/routes/export-sse/jobs.ts pruneJobs pattern). Runs without timers, on
 * the store's read/write paths; pollers that already observed a terminal
 * status stop before eviction, and post-TTL polls read as 404 (done).
 * @param now - current time (injectable for tests)
 */
export function pruneRunJobs(now = new Date(),): void {
  const cutoff = now.getTime() - RUN_TTL_MS;
  for (const [id, job,] of activeJobs) {
    const completed = parseExpiryMs(job.completedAt,);
    if (completed !== null && completed < cutoff) {
      activeJobs.delete(id,);
    }
  }

  while (activeJobs.size > MAX_RUNS) {
    let oldestId: string | undefined;
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

/** Input for a new job row. */
export interface CreateRunJobInput {
  ownerId: string;
  chainId: string;
  totalSteps: number;
}

/**
 * Create a pending job and store it.
 * @param input - Job identity fields
 * @returns the stored job (mutated in place by the executor)
 */
export function createRunJob(input: CreateRunJobInput,): ChainRunJob {
  const job: ChainRunJob = {
    id: uid(),
    ownerId: input.ownerId,
    chainId: input.chainId,
    status: "pending",
    totalSteps: input.totalSteps,
    completedSteps: 0,
    results: [],
    error: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  pruneRunJobs();
  activeJobs.set(job.id, job,);
  return job;
}

/**
 * Fetch a job by id.
 * @param jobId - Job id
 * @returns the job, or undefined when unknown
 */
export function getRunJob(jobId: string,): ChainRunJob | undefined {
  pruneRunJobs();
  return activeJobs.get(jobId,);
}

/**
 * List an owner's jobs, newest first.
 * @param ownerId - Owning user
 * @returns the owner's jobs
 */
export function listRunJobs(ownerId: string,): ChainRunJob[] {
  pruneRunJobs();
  const jobs: ChainRunJob[] = [];
  for (const job of activeJobs.values()) {
    if (job.ownerId === ownerId) { jobs.push(job,); }
  }

  return jobs.sort((a, b,) => b.startedAt.localeCompare(a.startedAt,));
}

/** Test seam: drop all stored jobs (the store is process-global). */
export function clearRunJobs(): void {
  activeJobs.clear();
}
