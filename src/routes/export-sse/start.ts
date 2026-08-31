// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import crypto from "node:crypto";
import { resolveUserIdFromRequest, } from "../../middleware/auth";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { HttpStatus, jsonError, } from "../http-utils";
import { jobs, processExport, sseData, } from "./jobs";
import type { ExportJob, HandlerOpts, } from "./types";

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function startRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  return new Elysia()
    // POST /api/export/progress — Start export and return SSE stream
    .post(`${prefix}/export/progress`, async (ctx: any,) => {
      const userId = await resolveUserIdFromRequest(ctx.request, database, "solo",);
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const jobId = crypto.randomUUID();
      const job: ExportJob = {
        id: jobId,
        userId,
        status: "queued",
        progress: 0,
        total: 0,
        currentStep: "Queued...",
        createdAt: new Date(),
      };
      jobs.set(jobId, job,);

      // Start processing in background
      void (async () => {
        try {
          await processExport(jobId, ctx.request, database, userId,);
        } catch (error) {
          console.error(`Export job ${jobId} failed:`, error,);
        }
      })();

      // Return SSE stream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller,) {
          // Send initial job info
          controller.enqueue(encoder.encode(sseData({
            type: "job_created",
            jobId,
            status: job.status,
          },),),);

          // Poll job status and send updates
          const interval = setInterval(() => {
            const currentJob = jobs.get(jobId,);
            if (!currentJob) {
              clearInterval(interval,);
              controller.close();
              return;
            }

            // Send progress update
            const percentage = currentJob.total > 0
              ? Math.round((currentJob.progress / currentJob.total) * 100,)
              : 0;
            const progressData = sseData({
              type: "progress",
              jobId,
              progress: currentJob.progress,
              total: currentJob.total,
              percentage,
              currentStep: currentJob.currentStep,
            },);
            controller.enqueue(encoder.encode(progressData,),);

            // Send completion event
            if (currentJob.status === "completed") {
              const completedData = sseData({
                type: "completed",
                jobId,
                downloadUrl: `/api/export/download/${jobId}`,
                totalItems: currentJob.total,
                completedAt: currentJob.completedAt?.toISOString(),
              },);
              controller.enqueue(encoder.encode(completedData,),);
              clearInterval(interval,);
              controller.close();
            } else if (currentJob.status === "failed") {
              controller.enqueue(encoder.encode(sseData({
                type: "failed",
                jobId,
                error: currentJob.error,
              },),),);
              clearInterval(interval,);
              controller.close();
            }
          }, 100,);
        },
      },);

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Start export with SSE progress",
        description: "Start a character export job and receive real-time progress via Server-Sent Events.",
        tags: ["Export",],
      },
    },);
}
