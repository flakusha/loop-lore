// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chain run jobs — in-memory store mirroring the matting/emotion-avatar
 * pattern (persists until server restart; status polling reads live state).
 */
import { uid, } from "../../utils";

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
  activeJobs.set(job.id, job,);
  return job;
}

/**
 * Fetch a job by id.
 * @param jobId - Job id
 * @returns the job, or undefined when unknown
 */
export function getRunJob(jobId: string,): ChainRunJob | undefined {
  return activeJobs.get(jobId,);
}

/**
 * List an owner's jobs, newest first.
 * @param ownerId - Owning user
 * @returns the owner's jobs
 */
export function listRunJobs(ownerId: string,): ChainRunJob[] {
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
