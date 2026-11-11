// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Poll one submitted video job. Foreign jobs report 404 (not 403) so ids
 * are not oracle-probeable. An expired pending job reports failed/504.
 * @param jobId - the job id from the submit response
 * @param database - unused (jobs are in-memory); kept for route-shape parity
 * @param userId - authenticated caller (required)
 * @param userRole - unused; kept for route-shape parity
 * @returns the job status response
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { failVideoJob, getVideoJob, } from "./video-jobs";

export function handleVideoGenerationStatus(
  jobId: string,
  database?: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Response {
  void database;
  void userRole;
  if (!userId) {
    return Response.json({ error: "Authentication required", status: 401, }, { status: 401, },);
  }

  const job = getVideoJob(jobId,);
  // 404 for foreign jobs too: confirming existence would leak another
  // user's job ids one probe at a time.
  if (!job || job.ownerId !== userId) {
    return Response.json({ error: "Video job not found", status: 404, }, { status: 404, },);
  }

  if (job.status === "done" && job.asset) {
    return Response.json({ data: { jobId: job.id, status: "done", asset: job.asset, }, },);
  }

  if (job.status === "failed") {
    return Response.json(
      { data: { jobId: job.id, status: "failed", error: job.error, code: job.errorStatus, }, },
    );
  }

  if (Date.now() > job.deadline) {
    failVideoJob(job.id, "Video generation timed out", 504,);
    return Response.json(
      { data: { jobId: job.id, status: "failed", error: "Video generation timed out", code: 504, }, },
    );
  }

  return Response.json({ data: { jobId: job.id, status: "pending", }, },);
}
