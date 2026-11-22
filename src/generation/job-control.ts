// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Owner-scoped control surface for async generation jobs.
 *
 * Routes in controller.ts:
 *   POST /api/v1/generation/jobs/:id/cancel
 *   POST /api/v1/generation/jobs/:id/retry
 *   POST /api/v1/generation/jobs/:id/defer
 *
 * Image/audio are synchronous request/response with no job handle, so they
 * have no stop surface here; video (including IVSS) is the async modality.
 */

import type { Kysely, } from "kysely";
import { getStore, } from "../async/store-registry";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import {
  cancelVideoJob,
  deferVideoJob,
  getVideoJob,
  markVideoJobRetried,
  resumeVideoJob,
} from "./video-jobs";

/** Bounds of a user-selected delay. */
export const DEFER_MIN_MS = 1_000;
export const DEFER_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFER_DEFAULT_MS = 60 * 60 * 1000;

/**
 * Validate a defer timestamp. Null = absent, timestamp = valid,
 * undefined = invalid. Shared by the submit route and the defer route.
 * @param value - user-supplied epoch ms
 * @param now - current epoch ms
 */
export function parseDeferTarget(value: unknown, now = Date.now(),): number | null | undefined {
  if (value === undefined || value === null) { return null; }
  if (typeof value !== "number" || !Number.isFinite(value,)) { return undefined; }
  if (value < now + DEFER_MIN_MS || value > now + DEFER_MAX_MS) { return undefined; }
  return value;
}

/** @returns a 401 response for unauthenticated callers. */
function unauthorized(): Response {
  return Response.json({ error: "Authentication required", status: 401, }, { status: 401, },);
}

/** 404 (not 403) for foreign ids so job existence is not oracle-probeable. */
function notFound(): Response {
  return Response.json({ error: "Generation job not found", status: 404, }, { status: 404, },);
}

/**
 * Cancel an owned job. Idempotent: an already-terminal job is a 200 no-op.
 * For IVSS the live run closure is invoked so the render actually stops.
 * @param jobId - job id from the submit response
 * @param userId - authenticated caller
 * @returns the control response
 */
export async function handleJobCancel(jobId: string, userId: string | undefined,): Promise<Response> {
  if (!userId) { return unauthorized(); }
  const job = getVideoJob(jobId,);
  if (!job || job.ownerId !== userId) { return notFound(); }

  const changed = cancelVideoJob(jobId, userId,);
  if (changed) {
    getStore()?.fail(jobId, { userId, }, "cancelled by user",);
    try {
      await job.cancel?.();
    } catch (error) {
      // Store cancel already applied; a failed remote cleanup must not turn
      // a successful user cancel into a 500.
      getChildLogger("job-control",)?.warn("live cancel closure failed", {
        jobId,
        error: error instanceof Error ? error.message : String(error,),
      },);
    }
  }

  return Response.json({ data: { jobId, status: changed ? "cancelled" : job.status, }, },);
}

/**
 * Delay an owned pending job. Idempotent: a second defer returns the first
 * scheduledFor. Running jobs refuse deferral (no suspend/resume seam exists).
 * @param jobId - job id from the submit response
 * @param userId - authenticated caller
 * @param body - optional `{ scheduledFor }` epoch ms
 * @returns the control response
 */
export async function handleJobDefer(
  jobId: string,
  userId: string | undefined,
  body: unknown,
): Promise<Response> {
  if (!userId) { return unauthorized(); }
  const job = getVideoJob(jobId,);
  if (!job || job.ownerId !== userId) { return notFound(); }
  if (job.status !== "pending") {
    return Response.json({ data: { jobId, status: job.status, deferred: false, }, },);
  }

  if (job.started) {
    return Response.json(
      { error: "Job is already running; set scheduledFor at submit time", status: 409, },
      { status: 409, },
    );
  }

  const now = Date.now();
  const requested = (body as { scheduledFor?: unknown } | null)?.scheduledFor;
  const target = parseDeferTarget(requested, now,);
  if (target === undefined) {
    return Response.json({ error: "Invalid scheduledFor", status: 400, }, { status: 400, },);
  }

  const scheduledFor = target ?? now + DEFER_DEFAULT_MS;
  const changed = deferVideoJob(jobId, userId, scheduledFor,);
  if (changed) { getStore()?.defer?.(jobId, { userId, }, scheduledFor,); }
  const current = getVideoJob(jobId,) ?? job;

  return Response.json({
    data: { jobId, status: "deferred", scheduledFor: current.scheduledFor ?? scheduledFor, },
  },);
}

/** Submit seam injected by the controller (keeps this module route-free). */
export type RetrySubmit = (
  body: unknown,
  database: Kysely<DB>,
  userId: string,
  userRole?: string | null,
) => Promise<Response>;

/** Dependencies for a retry: the live DB, caller role and submit handler. */
export interface RetryDeps {
  database: Kysely<DB>;
  userRole?: string | null;
  submit: RetrySubmit;
}

/**
 * Retry an owned terminal job with its original inputs, or resume a deferred
 * one now. A repeated retry returns the replacement job id, never a second
 * render. A still-running (non-deferred) job cannot be retried.
 * @param jobId - original job id
 * @param userId - authenticated caller
 * @param deps - submit seam and caller context
 * @returns the control response
 */
export async function handleJobRetry(
  jobId: string,
  userId: string | undefined,
  deps: RetryDeps,
): Promise<Response> {
  if (!userId) { return unauthorized(); }
  const job = getVideoJob(jobId,);
  if (!job || job.ownerId !== userId) { return notFound(); }

  if (job.status === "pending") {
    if (!job.deferred) {
      return Response.json({ error: "Job is still running", status: 409, }, { status: 409, },);
    }

    resumeVideoJob(jobId, userId,);
    getStore()?.resume?.(jobId, { userId, },);
    job.resume?.();
    return Response.json({ data: { jobId, status: "pending", resumed: true, }, },);
  }

  if (job.retryOf) {
    return Response.json({ data: { jobId: job.retryOf, status: "pending", repeated: true, }, },);
  }

  const submitted = await deps.submit(
    {
      prompt: job.request.prompt,
      negative_prompt: job.request.negativePrompt,
      seed: job.request.seed,
      seconds: job.request.seconds,
      frames: job.request.frames,
      width: job.request.width,
      height: job.request.height,
      chatId: job.chatId,
      messageId: job.messageId,
    },
    deps.database,
    userId,
    deps.userRole,
  );

  if (!submitted.ok) { return submitted; }

  const payload = await submitted.json() as { data?: { jobId?: string } };
  const newJobId = payload.data?.jobId;
  if (!newJobId) {
    return Response.json({ error: "Retry did not return a job id", status: 502, }, { status: 502, },);
  }

  markVideoJobRetried(jobId, userId, newJobId,);
  return Response.json(
    { data: { jobId: newJobId, status: "pending", retriedFrom: jobId, }, },
    { status: 202, },
  );
}
