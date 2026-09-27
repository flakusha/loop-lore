// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The two flag endpoints: which workflow is the default for a model family,
 * and which workflows are offered to the generation surface at all.
 * @module routes/admin-comfyui-workflows/flags
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { DefaultState, } from "../../db/enums-core/flags";
import { LoreEntryStatus, } from "../../db/enums-story/world";
import type { DB, } from "../../db/schema";
import { invalidateWorkflowRegistry, } from "../../generation/workflow-library";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { getWorkflowRow, } from "./rows";
import { log, workflowGuard, workflowNotFound, } from "./shared";

/**
 * @param opts
 * @param opts.database
 * @param prefix
 */
export function flagRoutes(opts: { database: Kysely<DB> }, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "admin-comfyui-workflows-flags", },)
      .guard({ beforeHandle: workflowGuard, }, (app,) =>
        app
          // ── Make this the default for its (model_family, modality) ──
          .post(
            `${prefix}/admin/comfyui-workflows/:id/default`,
            async (ctx,) => {
              const userId = requireUserId(ctx,);
              if (typeof userId !== "string") { return userId; }
              const { id, } = ctx.params;

              const row = await getWorkflowRow(database, id,);
              if (!row) { return workflowNotFound(id,); }

              const now = new Date().toISOString();
              // uq_prompt_templates_default_family / _global allow exactly one
              // default per (model_family, modality), so the incumbent is
              // demoted in the same transaction that promotes this row.
              await database.transaction().execute(async (trx,) => {
                const demote = trx.updateTable("prompt_templates",)
                  .set({ is_default: DefaultState.NotDefault, updated_at: now, },)
                  .where("modality", "=", "workflow",)
                  .where("is_default", "=", DefaultState.Default,)
                  .where("id", "!=", id,);
                if (row.model_family === null) {
                  await demote.where("model_family", "is", null,).execute();
                } else {
                  await demote.where("model_family", "=", row.model_family,).execute();
                }
                await trx.updateTable("prompt_templates",)
                  .set({ is_default: DefaultState.Default, updated_at: now, },)
                  .where("id", "=", id,)
                  .execute();
              },);

              invalidateWorkflowRegistry();
              log().info("workflow set as default", { id, modelFamily: row.model_family, },);
              return jsonResponse({ id, is_default: DefaultState.Default, },);
            },
            {
              response: {
                200: t.Unknown(),
                401: ErrorResponse,
                403: ErrorResponse,
                404: ErrorResponse,
              },
            },
          )
          // ── Toggle whether the row is offered to generation ────────
          .post(
            `${prefix}/admin/comfyui-workflows/:id/enabled`,
            async (ctx,) => {
              const userId = requireUserId(ctx,);
              if (typeof userId !== "string") { return userId; }
              const { id, } = ctx.params;

              const row = await getWorkflowRow(database, id,);
              if (!row) { return workflowNotFound(id,); }
              const enabled = row.enabled === LoreEntryStatus.Disabled
                ? LoreEntryStatus.Enabled
                : LoreEntryStatus.Disabled;

              await database.updateTable("prompt_templates",)
                .set({ enabled, updated_at: new Date().toISOString(), },)
                .where("id", "=", id,).where("modality", "=", "workflow",).execute();

              invalidateWorkflowRegistry();
              log().info("workflow enabled toggled", { id, enabled, },);
              return jsonResponse({ id, enabled, },);
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
