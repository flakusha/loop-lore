import { Elysia, } from "elysia";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { HttpStatus, jsonError, } from "../http-utils";
import { jobs, } from "./jobs";
import type { HandlerOpts, } from "./types";

export function downloadRoutes(_opts: HandlerOpts, prefix = "/api",): Elysia {
  return new Elysia()
    // GET /api/export/download/:jobId — Download completed export
    .get(`${prefix}/export/download/:jobId`, async (ctx: any,) => {
      const jobId = ctx.params.jobId;
      const job = jobs.get(jobId,);

      if (!job) {
        return jsonError({
          message: ctx.t?.("characters.emotionJobNotFound",) ?? "Job not found",
          status: HttpStatus.NotFound,
        },);
      }

      if (job.status !== "completed" || !job.zipBuffer) {
        return jsonError({
          message: ctx.t?.("exportJob.exportNotReady",) ?? "Export not ready",
          status: HttpStatus.BadRequest,
        },);
      }

      const timestamp = job.createdAt.toISOString().slice(0, 10,);
      return new Response(new Uint8Array(job.zipBuffer,), {
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
