// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ren'Py export route — POST /api/renpy/export@v1 builds a game overlay zip
 * (script.rpy, characters.rpy, README.md, avatar PNGs) from selected chats.
 * Versioned path (`@v1`): the next format revision ships `@v2` alongside.
 */
import type { Kysely, } from "kysely";
import JSZip from "jszip";
import type { DB, } from "../../../src/db/schema";
import type { PluginCaller, } from "../../../src/plugins/types";
import { HttpStatus, jsonError, } from "../../../src/routes/http-utils";
import { readJsonBody, } from "../../validation";
import { gatherExportModel, } from "./model";
import { parseExportBody, } from "./schema";
import { buildProjectFiles, } from "./script";

/** Versioned export path — bump alongside, never in place. */
export const EXPORT_PATH = "/api/renpy/export@v1";

/**
 * Build the export handler bound to a live db handle (captured in onLoad —
 * plugin route handlers are stateless `(request, caller)` by design).
 * @param db - Kysely database handle from the plugin context
 * @returns version-guarded POST handler returning the overlay zip
 */
export function makeExportHandler(db: Kysely<DB>,) {
  return async function handleExport(request: Request, caller?: PluginCaller,): Promise<Response | null> {
    const url = new URL(request.url,);
    if (url.pathname !== EXPORT_PATH || request.method !== "POST") { return null; }
    if (!caller?.userId) { return jsonError("authentication required", HttpStatus.Unauthorized,); }

    const body = await readJsonBody(request,);
    if (!body.ok) { return jsonError(body.error, HttpStatus.BadRequest,); }
    const input = parseExportBody(body.value,);
    if (!input.ok) { return jsonError(input.error, HttpStatus.BadRequest,); }

    let model;
    try {
      model = await gatherExportModel(db, { chatIds: input.value.chatIds, },);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "export failed", HttpStatus.NotFound,);
    }
    const files = buildProjectFiles(model,);

    const zip = new JSZip();
    for (const [path, text,] of Object.entries(files,)) {
      zip.file(path, text,);
    }
    for (const [path, bytes,] of model.images) {
      zip.file(path, bytes,);
    }
    const blob = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", },);
    return new Response(blob as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="renpy-export.zip"',
      },
    },);
  };
}
