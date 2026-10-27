// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { emotionJobNotFoundResponse, extractAuth, HttpStatus, jsonError, } from "../http-utils";
import { jobs, } from "./jobs";
import type { HandlerOpts, } from "./types";

/**
 * @param _opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
export function downloadRoutes(_opts: HandlerOpts, prefix = "/api",): Elysia {
  return new Elysia()
    // GET /api/export/download/:jobId — Download completed export
    .get(`${prefix}/export/download/:jobId`, (ctx: any,) => {
      const jobId = ctx.params.jobId;
      const job = jobs.get(jobId,);

      if (!job) {
        return emotionJobNotFoundResponse(ctx.t,);
      }

      // Ownership: only the owning user (or an admin) may download a job's
      // ZIP. 404 — not 403 — to avoid leaking job existence (IDOR).
      const { userId, userRole, } = extractAuth(ctx,);
      if (job.userId !== userId && userRole !== "admin") {
        return emotionJobNotFoundResponse(ctx.t,);
      }

      if (job.status !== "completed" || !job.zipBuffer) {
        return jsonError({
          message: ctx.t?.("exportJob.exportNotReady",) ?? "Export not ready",
          status: HttpStatus.BadRequest,
        },);
      }

      const timestamp = job.createdAt.toISOString().slice(0, 10,);
      // Copy out of the Buffer first, then release the retained reference:
      // the zip used to sit in the Map until the TTL evicted the whole job,
      // so every completed export held a full-account archive in memory for
      // up to JOB_TTL_MS after it had already been delivered (S-4).
      const body = new Uint8Array(job.zipBuffer,);
      job.zipBuffer = undefined;
      return new Response(body, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="loop-lore-export-${timestamp}.zip"`,
        },
      },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Download export",
        description: "Download a completed character export as a ZIP file.",
        tags: ["Export",],
      },
    },);
}
