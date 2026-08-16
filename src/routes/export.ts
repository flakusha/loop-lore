// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/export.ts
//
// Bulk export routes — export characters, chats, worlds, assets as ZIP archive.
//
// POST /api/export
// Returns a ZIP archive with all requested data.

import { Elysia, } from "elysia";
import JSZip from "jszip";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { resolveUserIdFromRequest, } from "../middleware/auth";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import {
  exportAssetsToZip,
  exportCharactersToZip,
  exportChatsToZip,
  exportLocationsToZip,
  exportStoryToZip,
  exportWorldsToZip,
  finalizeExportZip,
} from "./export-shared";
import { HttpStatus, jsonError, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function exportRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  return new Elysia({ name: "export", },).post(`${prefix}/export`, async (ctx: any,) => {
    const userId = await resolveUserIdFromRequest(ctx.request, database, "solo",);
    if (!userId) {
      return jsonError({
        message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
        status: HttpStatus.Unauthorized,
      },);
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await ctx.request.json()) as Record<string, unknown>;
    } catch {
      // Empty body is fine
    }

    const include = (body.include as string[]) ?? ["characters", "chats",];
    const format = (body.format as string) ?? "json";
    const chatIds = body.chat_ids as string[] | undefined;

    const zip = new JSZip();
    const counts: Record<string, number> = {};
    const checksums: Record<string, string> = {};

    const exportCtx = {
      database,
      userId,
      zip,
      checksums,
      format,
      chatIds,
      counts,
    };

    // Export characters
    if (include.includes("characters",)) {
      await exportCharactersToZip(exportCtx,);
    }

    // Export chats
    if (include.includes("chats",)) {
      await exportChatsToZip(exportCtx,);
    }

    // Export worlds
    if (include.includes("worlds",)) {
      await exportWorldsToZip(exportCtx,);
    }

    // Export locations
    if (include.includes("locations",)) {
      await exportLocationsToZip(exportCtx,);
    }

    // Export story state
    if (include.includes("story",)) {
      await exportStoryToZip(exportCtx,);
    }

    // Export assets
    if (include.includes("assets",)) {
      await exportAssetsToZip(exportCtx,);
    }

    // Build metadata
    const now = new Date();
    const zipBuffer = await finalizeExportZip({
      zip,
      checksums,
      counts,
      userId,
      now,
      format,
      include,
    },);
    const timestamp = now.toISOString().slice(0, 10,);

    return new Response(new Uint8Array(zipBuffer,), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="loop-lore-export-${timestamp}.zip"`,
      },
    },);
  }, {
    response: {
      200: SuccessResponse,
      401: ErrorResponse,
    },
    detail: {
      summary: "Export data as ZIP archive",
      description: "Bulk export characters, chats, worlds, and assets as a ZIP archive with manifest and checksums.",
      tags: ["Export",],
    },
  },);
}
