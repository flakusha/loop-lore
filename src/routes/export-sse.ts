// src/routes/export-sse.ts
//
// Bulk export routes with SSE progress reporting.
// POST /api/export/progress — Returns SSE stream with progress events.
// GET /api/export/download/:jobId — Downloads the completed export ZIP.

import { Elysia, t, } from "elysia";
import JSZip from "jszip";
import type { Kysely, } from "kysely";
import crypto from "node:crypto";
import type { DB, } from "../db/schema";
import { resolveUserIdFromRequest, } from "../middleware/auth";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import {
  addChecksum,
  exportAssetsToZip,
  exportCharactersToZip,
  exportChatsToZip,
  exportWorldsToZip,
} from "./export-shared";
import type { ExportItem, } from "./export-shared";
import { HttpStatus, jsonError, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

interface ExportJob {
  id: string;
  userId: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  total: number;
  currentStep: string;
  zipBuffer?: Buffer;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// In-memory job store (in production, use Redis or DB)
const jobs = new Map<string, ExportJob>();

function sseData(obj: unknown,): string {
  const r = safeJsonStringify(obj,);
  return `data: ${r.ok ? r.value : '{"type":"error","error":"serialize failed"}'}\n\n`;
}

function safeJsonStringify(obj: unknown, indent?: number,): { ok: true; value: string } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.stringify(obj, null, indent,), };
  } catch (error) {
    return { ok: false, error: error as Error, };
  }
}

async function processExport(
  jobId: string,
  request: Request,
  database: Kysely<DB>,
  userId: string,
): Promise<void> {
  const job = jobs.get(jobId,);
  if (!job) { return; }

  try {
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // Empty body is fine
    }

    const include = (body.include as string[]) ?? ["characters", "chats",];
    const format = (body.format as string) ?? "json";
    const chatIds = body.chat_ids as string[] | undefined;

    const zip = new JSZip();
    const counts: Record<string, number> = {};
    const checksums: Record<string, string> = {};
    const assetManifest: ExportItem[] = [];

    // Calculate total items for progress
    let totalItems = 0;

    if (include.includes("characters",)) {
      const charCount = await database
        .selectFrom("actors",)
        .select(({ fn, },) => [fn.count<number>("id",).as("count",),])
        .where("actor_type", "=", "character",)
        .where("user_id", "=", userId,)
        .executeTakeFirst();
      totalItems += charCount?.count ?? 0;
    }

    if (include.includes("chats",)) {
      const chatCount = await database
        .selectFrom("chats",)
        .select(({ fn, },) => [fn.count<number>("id",).as("count",),])
        .where("created_by", "=", userId,)
        .executeTakeFirst();
      totalItems += chatCount?.count ?? 0;
    }

    if (include.includes("worlds",)) {
      const worldCount = await database
        .selectFrom("worlds",)
        .select(({ fn, },) => [fn.count<number>("id",).as("count",),])
        .where("owner_id", "=", userId,)
        .executeTakeFirst();
      totalItems += worldCount?.count ?? 0;
    }

    if (include.includes("assets",)) {
      const assetCount = await database
        .selectFrom("assets",)
        .select(({ fn, },) => [fn.count<number>("id",).as("count",),])
        .where("owner_id", "=", userId,)
        .executeTakeFirst();
      totalItems += assetCount?.count ?? 0;
    }

    job.total = totalItems;
    job.progress = 0;
    job.currentStep = "Starting export...";
    job.status = "processing";

    let processedItems = 0;
    const onItem = (item: ExportItem,): void => {
      assetManifest.push(item,);
      processedItems++;
      job.progress = processedItems;
    };
    const exportCtx = {
      database,
      userId,
      zip,
      checksums,
      format,
      chatIds,
      counts,
      onItem,
    };

    // Export characters
    if (include.includes("characters",)) {
      job.currentStep = "Exporting characters...";
      await exportCharactersToZip(exportCtx,);
    }

    // Export chats
    if (include.includes("chats",)) {
      job.currentStep = "Exporting chats...";
      await exportChatsToZip(exportCtx,);
    }

    // Export worlds
    if (include.includes("worlds",)) {
      job.currentStep = "Exporting worlds...";
      await exportWorldsToZip(exportCtx,);
    }

    // Export assets
    if (include.includes("assets",)) {
      job.currentStep = "Exporting assets...";
      await exportAssetsToZip(exportCtx,);
    }

    // Build metadata
    const now = new Date();
    const exportInfo = {
      exported_at: now.toISOString(),
      exported_by: userId,
      format,
      includes: include,
      item_count: Object.values(counts,).reduce((a, b,) => a + b, 0,),
    };
    const schemaVersion = {
      schema_version: "1.0",
      export_format_version: "1.0",
    };

    // Add metadata to zip + checksums
    const metadataFolder = zip.folder("metadata",);
    const exportInfoStr = JSON.stringify(exportInfo, null, 2,);
    metadataFolder?.file("export-info.json", exportInfoStr,);
    addChecksum(checksums, "metadata/export-info.json", exportInfoStr,);

    const schemaVersionStr = JSON.stringify(schemaVersion, null, 2,);
    metadataFolder?.file("schema-version.json", schemaVersionStr,);
    addChecksum(checksums, "metadata/schema-version.json", schemaVersionStr,);

    // Add asset manifest to metadata
    const assetManifestStr = JSON.stringify(assetManifest, null, 2,);
    metadataFolder?.file("asset-manifest.json", assetManifestStr,);
    addChecksum(checksums, "metadata/asset-manifest.json", assetManifestStr,);

    // Build manifest (includes checksums from all folders + metadata)
    const manifest = {
      version: "1.0",
      exported_at: now.toISOString(),
      exported_by: userId,
      format_version: "1.0",
      contents: counts,
      checksums,
      asset_manifest: assetManifest,
    };
    const manifestStr = JSON.stringify(manifest, null, 2,);
    zip.file("manifest.json", manifestStr,);
    addChecksum(checksums, "manifest.json", manifestStr,);

    // Regenerate ZIP with final manifest (checksums updated)
    const finalManifest = {
      version: "1.0",
      exported_at: now.toISOString(),
      exported_by: userId,
      format_version: "1.0",
      contents: counts,
      checksums,
      asset_manifest: assetManifest,
    };
    zip.file("manifest.json", JSON.stringify(finalManifest, null, 2,),);

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", },);

    // Store the ZIP buffer in the job
    job.zipBuffer = zipBuffer;
    job.status = "completed";
    job.completedAt = new Date();
    job.progress = job.total;
    job.currentStep = "Export completed";
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Unknown error";
    job.completedAt = new Date();
  }
}

export function exportSseRoutes({ database, }: HandlerOpts,): Elysia {
  return new Elysia({ name: "export-sse", },)
    // POST /api/export/progress — Start export and return SSE stream
    .post("/api/export/progress", async (ctx: any,) => {
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
      processExport(jobId, ctx.request, database, userId,).catch((error,) => {
        console.error(`Export job ${jobId} failed:`, error,);
      },);

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
    },)
    // GET /api/export/download/:jobId — Download completed export
    .get("/api/export/download/:jobId", async (ctx: any,) => {
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
    },)
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
