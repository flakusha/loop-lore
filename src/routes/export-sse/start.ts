// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import crypto from "node:crypto";
import { loadConfig, } from "../../config/load";
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
      const { auth: authConfig, } = loadConfig();
      const userId = await resolveUserIdFromRequest(ctx.request, database, "solo", authConfig,);
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
          // Client disconnects mid-stream make any further controller op throw
          // ("Controller is already closed"). Every enqueue/close below runs
          // through safeEnqueue/safeClose so the poller tears down quietly
          // instead of throwing from a setInterval tick
          // (BUG-export-sse-start-throws-controller-is-already-closed-on-clie).
          let closed = false;
          const interval = setInterval(poll, 100,);

          function teardown(): void {
            closed = true;
            clearInterval(interval,);
            try {
              controller.close();
            } catch {
              // Already closed by the runtime after client disconnect.
            }
          }

          function safeEnqueue(chunk: Uint8Array,): void {
            if (closed) { return; }
            try {
              controller.enqueue(chunk,);
            } catch {
              teardown();
            }
          }

          function poll(): void {
            if (closed) { return; }
            const currentJob = jobs.get(jobId,);
            if (!currentJob) {
              teardown();
              return;
            }

            // Send progress update
            const percentage = currentJob.total > 0
              ? Math.round((currentJob.progress / currentJob.total) * 100,)
              : 0;
            safeEnqueue(encoder.encode(sseData({
              type: "progress",
              jobId,
              progress: currentJob.progress,
              total: currentJob.total,
              percentage,
              currentStep: currentJob.currentStep,
            },),),);
            if (closed) { return; }

            // Send completion event
            if (currentJob.status === "completed") {
              safeEnqueue(encoder.encode(sseData({
                type: "completed",
                jobId,
                downloadUrl: `/api/export/download/${jobId}`,
                totalItems: currentJob.total,
                completedAt: currentJob.completedAt?.toISOString(),
              },),),);
              teardown();
            } else if (currentJob.status === "failed") {
              safeEnqueue(encoder.encode(sseData({
                type: "failed",
                jobId,
                error: currentJob.error,
              },),),);
              teardown();
            }
          }

          safeEnqueue(encoder.encode(sseData({
            type: "job_created",
            jobId,
            status: job.status,
          },),),);
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
