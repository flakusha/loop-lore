// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import JSZip from "jszip";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, } from "../../utils";
import {
  exportAssetsToZip,
  exportCharactersToZip,
  exportChatsToZip,
  exportLocationsToZip,
  exportStoryToZip,
  exportWorldsToZip,
  finalizeExportZip,
} from "../export-shared";
import type { ExportItem, } from "../export-shared";
import type { ExportJob, } from "./types";

// In-memory job store (in production, use Redis or DB)
const jobs = new Map<string, ExportJob>();

/**
 * @param obj
 */
function sseData(obj: unknown,): string {
  const r = safeJsonStringify(obj,);
  return `data: ${r.ok ? r.value : '{"type":"error","error":"serialize failed"}'}\n\n`;
}

/**
 * @param jobId
 * @param request
 * @param database
 * @param userId
 */
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

    if (include.includes("locations",)) {
      const locCount = await database
        .selectFrom("locations",)
        .innerJoin("worlds", "worlds.id", "locations.world_id",)
        .select(({ fn, },) => [fn.count<number>("locations.id",).as("count",),])
        .where("worlds.owner_id", "=", userId,)
        .executeTakeFirst();
      totalItems += locCount?.count ?? 0;
    }

    if (include.includes("story",)) {
      const worldCount = await database
        .selectFrom("worlds",)
        .select(({ fn, },) => [fn.count<number>("id",).as("count",),])
        .where("owner_id", "=", userId,)
        .executeTakeFirst();
      totalItems += worldCount?.count ?? 0;
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

    // Export locations
    if (include.includes("locations",)) {
      job.currentStep = "Exporting locations...";
      await exportLocationsToZip(exportCtx,);
    }

    // Export story state
    if (include.includes("story",)) {
      job.currentStep = "Exporting story state...";
      await exportStoryToZip(exportCtx,);
    }
    // Export assets
    if (include.includes("assets",)) {
      job.currentStep = "Exporting assets...";
      await exportAssetsToZip(exportCtx,);
    }

    // Build metadata + manifest, then generate the ZIP
    const now = new Date();
    const zipBuffer = await finalizeExportZip({
      zip,
      checksums,
      counts,
      userId,
      now,
      format,
      include,
      assetManifest,
    },);

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

export { jobs, processExport, sseData, };
