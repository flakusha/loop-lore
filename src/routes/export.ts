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
  addChecksum,
  exportAssetsToZip,
  exportCharactersToZip,
  exportChatsToZip,
  exportWorldsToZip,
} from "./export-shared";
import { HttpStatus, jsonError, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function exportRoutes({ database, }: HandlerOpts,): Elysia {
  return new Elysia({ name: "export", },).post("/api/export", async (ctx: any,) => {
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

    // Export assets
    if (include.includes("assets",)) {
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

    // Build manifest (includes checksums from all folders + metadata)
    const manifest = {
      version: "1.0",
      exported_at: now.toISOString(),
      exported_by: userId,
      format_version: "1.0",
      contents: counts,
      checksums,
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
    };
    zip.file("manifest.json", JSON.stringify(finalManifest, null, 2,),);

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", },);
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
  },) as unknown as Elysia;
}
