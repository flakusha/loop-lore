import { Elysia, t, } from "elysia";
import { ErrorResponse, } from "../../validation/schemas";
import { HttpStatus, jsonError, } from "../http-utils";
import { jobs, } from "./jobs";
import type { HandlerOpts, } from "./types";

export function statusRoutes(_opts: HandlerOpts,): Elysia {
  return new Elysia()
    // GET /api/export/status/:jobId — Get job status
    .get("/api/export/status/:jobId", (ctx: any,) => {
      const jobId = ctx.params.jobId;
      const job = jobs.get(jobId,);

      if (!job) {
        return jsonError({
          message: ctx.t?.("characters.emotionJobNotFound",) ?? "Job not found",
          status: HttpStatus.NotFound,
        },);
      }

      return {
        id: job.id,
        status: job.status,
        progress: job.progress,
        total: job.total,
        percentage: job.total > 0 ? Math.round((job.progress / job.total) * 100,) : 0,
        currentStep: job.currentStep,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString(),
        error: job.error,
      };
    }, {
      response: {
        200: t.Any(),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get export job status",
        description: "Get the current status and progress of an export job.",
        tags: ["Export",],
      },
    },) as unknown as Elysia;
}
