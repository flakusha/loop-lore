// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin/owner cancel for an async video job, by job id.
 *
 *   POST /api/v1/generation/video/cancel — body: { jobId }
 *
 * The owner handler already calls the shipped `cancelVideoJob`, fails the
 * async-store record and invokes the live IVSS cancel closure. This route only
 * decides who may use it: the job owner, or an `admin.system` caller for any
 * job. Foreign ids read 404 so job existence stays unprobeable.
 */
import type { Context, } from "elysia";
import { handleJobCancel, } from "../../generation/job-control";
import { getVideoJob, } from "../../generation/video-jobs";
import { can, } from "../../users/permissions";
import { badRequestResponse, notFoundResponse, requireUserId, } from "../http-utils";

/** Auth fields populated by the global Elysia derive middleware. */
interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

/**
 * Cancel a pending video job by id.
 * @param body - parsed request body carrying `jobId`
 * @param ctx - typed request context with the derived auth fields
 * @returns 401/404/400 JSON error, or the owner-handler's structured cancel result
 */
export async function handleVideoCancel(body: unknown, ctx: Ctx,): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  const jobId = (body as { jobId?: unknown } | null)?.jobId;
  if (typeof jobId !== "string" || jobId.length === 0) {
    return badRequestResponse("jobId is required",);
  }

  const job = getVideoJob(jobId,);
  if (!job || (job.ownerId !== userId && !can(ctx.userRole, "admin.system",))) {
    return notFoundResponse("Generation job not found",);
  }

  // Passing the job's owner keeps the shipped ownership guard intact for
  // admins; the handler owns every cancellation side effect.
  return handleJobCancel(jobId, job.ownerId,);
}
