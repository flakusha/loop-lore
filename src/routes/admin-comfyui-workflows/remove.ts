// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Delete endpoint.
 * @module routes/admin-comfyui-workflows/remove
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { invalidateWorkflowRegistry, } from "../../generation/workflow-library";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonNoContent, requireUserId, } from "../http-utils";
import { getWorkflowRow, } from "./rows";
import { log, workflowGuard, workflowNotFound, } from "./shared";

/**
 * @param opts
 * @param opts.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { admin: { "comfyui-workflows": { ...; }; }; }; }, { ...; }, { ...; }>}
 */
export function removeRoutes(opts: { database: Kysely<DB> }, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "admin-comfyui-workflows-remove", },)
      .guard({ beforeHandle: workflowGuard, }, (app,) =>
        app
          // ── Delete a workflow row ───────────────────────────────
          .delete(
            `${prefix}/admin/comfyui-workflows/:id`,
            async (ctx,) => {
              const userId = requireUserId(ctx,);
              if (typeof userId !== "string") { return userId; }
              const { id, } = ctx.params;

              // 404 rather than a silent no-op when the id is another
              // modality's row: the operator asked to delete a workflow and
              // must not be told it worked when their LLM template is intact.
              const row = await getWorkflowRow(database, id,);
              if (!row) { return workflowNotFound(id,); }

              await database.deleteFrom("prompt_templates",)
                .where("id", "=", id,).where("modality", "=", "workflow",).execute();

              invalidateWorkflowRegistry();
              log().info("workflow row deleted", { id, },);
              return jsonNoContent();
            },
            {
              response: {
                204: t.Void(),
                401: ErrorResponse,
                403: ErrorResponse,
                404: ErrorResponse,
              },
            },
          ),)
  );
}
