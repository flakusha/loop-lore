// src/routes/export-sse.ts
//
// Bulk export routes with SSE progress reporting.
// POST /api/export/progress — Returns SSE stream with progress events.
// GET /api/export/download/:jobId — Downloads the completed export ZIP.

import { Elysia, t, } from "elysia";
import JSZip from "jszip";
import type { Kysely, } from "kysely";
import crypto from "node:crypto";
import { exportToCcV3Json, } from "../characters/exporters/ccv3";
import { exportToPng, } from "../characters/exporters/png";
import { exportToYaml, } from "../characters/exporters/yaml";
import type { CanonicalCharacter, } from "../characters/parser";
import type { DB, } from "../db/schema";
import { getOrCreateSoloUserForAuth, } from "../middleware/auth";
import { jsonParseOr, } from "../utils";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
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

async function resolveUserId(request: Request, database: Kysely<DB>,): Promise<string | null> {
  const cookieHeader = request.headers.get("Cookie",);
  const match = cookieHeader ? /ll_token=([^;]+)/.exec(cookieHeader,) : null;
  if (match) {
    const tokenHash = crypto.createHash("sha256",).update(match[1]!,).digest("hex",);
    const session = await database
      .selectFrom("sessions",)
      .select(["user_id",],)
      .where("token_hash", "=", tokenHash,)
      .executeTakeFirst();
    if (session) { return session.user_id; }
  }
  const solo = await getOrCreateSoloUserForAuth(database, "solo",);
  return solo?.id ?? null;
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
    const assetManifest: AssetManifestEntry[] = [];

    function addChecksum(path: string, content: string | Buffer,) {
      checksums[path] = `sha256:${crypto.createHash("sha256",).update(content,).digest("hex",)}`;
    }

    // Calculate total items for progress
    let totalItems = 0;
    let processedItems = 0;

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

    // Export characters
    if (include.includes("characters",)) {
      job.currentStep = "Exporting characters...";
      const characters = await database
        .selectFrom("actors",)
        .select([
          "id",
          "display_name",
          "description",
          "personality",
          "scenario",
          "system_prompt",
          "welcome_message",
          "mes_example",
          "post_history_instructions",
          "creator",
          "creator_notes",
          "character_version",
          "alternate_greetings",
        ],)
        .where("actor_type", "=", "character",)
        .where("user_id", "=", userId,)
        .execute();

      const charsFolder = zip.folder("characters",);
      for (const char of characters) {
        const canonical: CanonicalCharacter = {
          name: char.display_name,
          description: char.description ?? "",
          personality: char.personality ?? "",
          scenario: char.scenario ?? undefined,
          welcome_message: char.welcome_message ?? undefined,
          mes_example: char.mes_example ?? undefined,
          system_prompt: char.system_prompt ?? undefined,
          post_history_instructions: char.post_history_instructions ?? undefined,
          creator: char.creator ?? undefined,
          creator_notes: char.creator_notes ?? undefined,
          alternate_greetings: char.alternate_greetings ? jsonParseOr(char.alternate_greetings, [],) : undefined,
        };

        const filename = char.display_name.replaceAll(/[^a-z0-9]/gi, "_",).toLowerCase();
        if (format === "yaml") {
          const content = exportToYaml(canonical,);
          charsFolder?.file(`${filename}.yaml`, content,);
          addChecksum(`characters/${filename}.yaml`, content,);
        } else if (format === "png") {
          const pngBuf = exportToPng(canonical,);
          charsFolder?.file(`${filename}.png`, pngBuf,);
          addChecksum(`characters/${filename}.png`, pngBuf,);
        } else {
          const content = exportToCcV3Json(canonical,);
          charsFolder?.file(`${filename}.json`, content,);
          addChecksum(`characters/${filename}.json`, content,);
        }

        // Add to asset manifest
        let charExt = "json";
        if (format === "yaml") { charExt = "yaml"; }
        else if (format === "png") { charExt = "png"; }
        let charSize = exportToCcV3Json(canonical,).length;
        if (format === "yaml") { charSize = exportToYaml(canonical,).length; }
        else if (format === "png") { charSize = exportToPng(canonical,).length; }
        assetManifest.push({
          id: char.id,
          type: "character",
          name: char.display_name,
          format,
          filename: `${filename}.${charExt}`,
          checksum: checksums[`characters/${filename}.${charExt}`] ?? "",
          size: charSize,
        },);

        processedItems++;
        job.progress = processedItems;
      }
      counts.characters = characters.length;
    }

    // Export chats
    if (include.includes("chats",)) {
      job.currentStep = "Exporting chats...";
      let query = database
        .selectFrom("chats",)
        .select(["id", "name", "type", "mode", "created_at",],)
        .where("created_by", "=", userId,);

      if (chatIds && chatIds.length > 0) {
        query = query.where("id", "in", chatIds,);
      }

      const chats = await query.execute();
      const chatsFolder = zip.folder("chats",);

      for (const chat of chats) {
        const messages = await database
          .selectFrom("messages",)
          .innerJoin("actors", "actors.id", "messages.actor_id",)
          .select([
            "messages.id",
            "messages.content",
            "messages.role",
            "messages.created_at",
            "actors.display_name",
          ],)
          .where("messages.chat_id", "=", chat.id,)
          .orderBy("messages.created_at", "asc",)
          .execute();

        const chatData = {
          id: chat.id,
          name: chat.name,
          type: chat.type,
          mode: chat.mode,
          created_at: chat.created_at,
          messages: messages.map((m,) => ({
            id: m.id,
            role: m.role,
            author: m.display_name,
            content: m.content,
            created_at: m.created_at,
          })),
        };

        const filename = (chat.name ?? chat.id).replaceAll(/[^a-z0-9]/gi, "_",).toLowerCase();
        const content = JSON.stringify(chatData, null, 2,);
        chatsFolder?.file(`${filename}.json`, content,);
        addChecksum(`chats/${filename}.json`, content,);

        // Add to asset manifest
        assetManifest.push({
          id: chat.id,
          type: "chat",
          name: chat.name ?? chat.id,
          format: "json",
          filename: `${filename}.json`,
          checksum: checksums[`chats/${filename}.json`] ?? "",
          size: content.length,
          metadata: {
            message_count: messages.length,
            chat_type: chat.type,
            chat_mode: chat.mode,
          },
        },);

        processedItems++;
        job.progress = processedItems;
      }
      counts.chats = chats.length;
    }

    // Export worlds
    if (include.includes("worlds",)) {
      job.currentStep = "Exporting worlds...";
      const worlds = await database
        .selectFrom("worlds",)
        .selectAll()
        .where("owner_id", "=", userId,)
        .execute();

      const worldsFolder = zip.folder("worlds",);
      for (const world of worlds) {
        const content = JSON.stringify(world, null, 2,);
        worldsFolder?.file(`${world.id}.json`, content,);
        addChecksum(`worlds/${world.id}.json`, content,);

        // Add to asset manifest
        assetManifest.push({
          id: world.id,
          type: "world",
          name: world.name ?? world.id,
          format: "json",
          filename: `${world.id}.json`,
          checksum: checksums[`worlds/${world.id}.json`] ?? "",
          size: content.length,
        },);

        processedItems++;
        job.progress = processedItems;
      }
      counts.worlds = worlds.length;
    }

    // Export assets
    if (include.includes("assets",)) {
      job.currentStep = "Exporting assets...";
      const assets = await database
        .selectFrom("assets",)
        .selectAll()
        .where("owner_id", "=", userId,)
        .execute();

      const assetsFolder = zip.folder("assets",);
      for (const asset of assets) {
        if (!asset.storage_path) { continue; }
        const file = Bun.file(asset.storage_path,);
        if (!(await file.exists())) { continue; }
        const buffer = await file.arrayBuffer();
        const name = `${asset.id}-${asset.filename}`;
        assetsFolder?.file(name, buffer,);
        addChecksum(`assets/${name}`, Buffer.from(buffer,),);

        // Add to asset manifest
        assetManifest.push({
          id: asset.id,
          type: "asset",
          name: asset.filename,
          format: asset.mime_type?.split("/", 2,)[1] ?? "unknown",
          filename: name,
          checksum: checksums[`assets/${name}`] ?? "",
          size: buffer.byteLength,
          metadata: {
            mime_type: asset.mime_type,
            asset_type: asset.asset_type,
          },
        },);

        processedItems++;
        job.progress = processedItems;
      }
      counts.assets = assets.length;
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
    addChecksum("metadata/export-info.json", exportInfoStr,);

    const schemaVersionStr = JSON.stringify(schemaVersion, null, 2,);
    metadataFolder?.file("schema-version.json", schemaVersionStr,);
    addChecksum("metadata/schema-version.json", schemaVersionStr,);

    // Add asset manifest to metadata
    const assetManifestStr = JSON.stringify(assetManifest, null, 2,);
    metadataFolder?.file("asset-manifest.json", assetManifestStr,);
    addChecksum("metadata/asset-manifest.json", assetManifestStr,);

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
    addChecksum("manifest.json", manifestStr,);

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

interface AssetManifestEntry {
  id: string;
  type: "character" | "chat" | "world" | "asset";
  name: string;
  format: string;
  filename: string;
  checksum: string;
  size: number;
  metadata?: Record<string, unknown>;
}
export function exportSseRoutes({ database, }: HandlerOpts,): Elysia {
  return new Elysia({ name: "export-sse", },)
    // POST /api/export/progress — Start export and return SSE stream
    .post("/api/export/progress", async (ctx: any,) => {
      const userId = await resolveUserId(ctx.request, database,);
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
