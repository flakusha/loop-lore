// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Read endpoints: list the library, and fetch one row with its full payload.
 * @module routes/admin-comfyui-workflows/list
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { ComfyUINodeInfo, } from "../../generation/providers/comfyui";
import { ComfyUIEditProvider, } from "../../image-edit/providers/comfyui-provider";
import { jsonParseOr, } from "../../utils";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { getWorkflowRow, listWorkflowRows, toSummary, } from "./rows";
import { log, workflowGuard, workflowNotFound, } from "./shared";

/** List filter. Any other value is ignored rather than rejected. */
const ListQuery = t.Object({ enabled: t.Optional(t.String(),), },);

/** Node info from the last successful probe; ComfyUI going away is not cached. */
let installedNodes: ComfyUINodeInfo[] | null = null;

/**
 * Live ComfyUI node classes, or null when the server is unreachable.
 *
 * Best effort by design: the library stays editable with ComfyUI offline, and
 * the caller reports missing nodes only when this resolves.
 */
async function installedNodeClasses(): Promise<ComfyUINodeInfo[] | null> {
  if (installedNodes) { return installedNodes; }
  try {
    const info = await new ComfyUIEditProvider().getNodeInfo();
    installedNodes = Object.values(info,);
    return installedNodes;
  } catch (error) {
    log().warn({ message: "ComfyUI node discovery failed", error: String(error,), },);
    return null;
  }
}

/**
 * @param opts
 * @param opts.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { "comfyui-workflows": { ...; }; }; }; } & { ...; }, { ...; }, { ...; }>}
 */
export function listRoutes(opts: { database: Kysely<DB> }, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "admin-comfyui-workflows-list", },)
      .guard({ beforeHandle: workflowGuard, }, (app,) =>
        app
          // ── List workflow rows, optionally filtered by enabled ──
          .get(
            `${prefix}/admin/comfyui-workflows`,
            async (ctx,) => {
              const userId = requireUserId(ctx,);
              if (typeof userId !== "string") { return userId; }
              const { enabled, } = ctx.query;
              const rows = await listWorkflowRows(database, enabled,);
              const installed = await installedNodeClasses();
              return jsonResponse({
                workflows: rows.map((row,) => toSummary(row, installed,)),
                total: rows.length,
                comfyui_reachable: installed !== null,
              },);
            },
            {
              query: ListQuery,
              response: { 200: t.Unknown(), 401: ErrorResponse, 403: ErrorResponse, },
            },
          )
          // ── Get one workflow row with its full payload ───────────
          .get(
            `${prefix}/admin/comfyui-workflows/:id`,
            async (ctx,) => {
              const userId = requireUserId(ctx,);
              if (typeof userId !== "string") { return userId; }
              const { id, } = ctx.params;
              const row = await getWorkflowRow(database, id,);
              if (!row) { return workflowNotFound(id,); }
              const installed = await installedNodeClasses();
              return jsonResponse({
                ...toSummary(row, installed,),
                payload: jsonParseOr<unknown>(row.payload, null,),
              },);
            },
            {
              response: {
                200: t.Unknown(),
                401: ErrorResponse,
                403: ErrorResponse,
                404: ErrorResponse,
              },
            },
          ),)
  );
}
