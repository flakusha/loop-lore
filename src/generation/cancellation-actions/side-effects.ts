// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Side-effect job registration for in-flight generations.
 *
 * The stop-and-respond interrupt requirement is that queued TTS / image
 * jobs (anything that consumes the model's streamed output after the LLM
 * call finishes) MUST cancel cleanly when the user hits Stop, otherwise
 * the platform keeps producing audio / images for a response the user
 * never saw.
 *
 * Callers register a job with the in-flight generation attempt via
 * `registerSideEffectJob`. The cancellation manager fan-out (see
 * cancellation-actions/cancel.ts) iterates registered jobs and invokes
 * each cancel() when the generation aborts.
 *
 * The registry lives on the in-memory ActiveGeneration record so the
 * fan-out is synchronous with the abort signal — no extra DB roundtrip
 * is needed to discover which jobs belong to which attempt.
 */
import { getLogger, } from "../../logger";
import { activeGenerations, } from "../cancellation-tracker";
import type { SideEffectJob, } from "../cancellation-tracker/types";

/**
 * Register a side-effect job with the in-flight generation attempt.
 * Returns true on success, false if the attempt is no longer active.
 * @param attemptId
 * @param job
 */
export function registerSideEffectJob(attemptId: string, job: SideEffectJob,): boolean {
  const active = activeGenerations.get(attemptId,);
  if (!active) {
    getLogger()
      .child({ module: "generation", },)
      .warn("registerSideEffectJob: attempt not active", { attemptId, jobId: job.id, kind: job.kind, },);
    return false;
  }

  const map = (active.sideEffectJobs ??= new Map());
  map.set(job.id, job,);
  return true;
}

/**
 * Unregister a side-effect job (e.g. after a successful completion).
 * Idempotent — unregistering a job that already ran to completion is
 * a no-op.
 * @param attemptId
 * @param jobId
 */
export function unregisterSideEffectJob(attemptId: string, jobId: string,): boolean {
  const active = activeGenerations.get(attemptId,);
  if (!active) { return false; }
  const map = (active.sideEffectJobs ??= new Map());
  return map.delete(jobId,);
}

/**
 * Look up the registered side-effect jobs for an attempt. Returns an
 * empty array when the attempt is no longer active. The returned jobs
 * must not be mutated by callers — use register/unregister to change
 * the registry.
 * @param attemptId
 */
export function listSideEffectJobs(attemptId: string,): readonly SideEffectJob[] {
  const active = activeGenerations.get(attemptId,);
  if (!active) { return []; }
  const map = (active.sideEffectJobs ??= new Map());
  return Array.from(map.values(),);
}
