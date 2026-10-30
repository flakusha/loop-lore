// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { latestNews, pollAllFeeds, } from "../../models/news";
import { triageNewsItem, } from "../../models/news-triage";
import { confirmWeightChange, } from "../../models/weight-confirm";
import { ErrorResponse, } from "../../validation/schemas";
import { HttpStatus, jsonResponse, requirePermissionUserId, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * Admin model-news routes — the admin tab's data surface.
 *
 * GET returns the freshest polled snapshot per feed family (empty
 * items when never polled); POST triggers a re-poll. Failures degrade
 * to stale data, never to an error body.
 * @param opts
 * @param prefix
 */
export function newsRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;
  return (
    new Elysia({ name: "admin-news", },)
      .get(`${prefix}/admin/model-news`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        return jsonResponse({ families: await latestNews(db,), },);
      }, {
        response: {
          200: t.Object({ families: t.Array(t.Any(),), },),
          403: ErrorResponse,
        },
      },)
      .post(`${prefix}/admin/model-news/refresh`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        const total = await pollAllFeeds(db,);
        return jsonResponse({ families: await latestNews(db,), polled: total, },);
      }, {
        response: {
          200: t.Object({ families: t.Array(t.Any(),), polled: t.Number(), },),
          403: ErrorResponse,
        },
      },)
      .post(`${prefix}/admin/model-news/triage`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        const body = ctx.body as { itemId?: unknown; dismissed?: unknown } | undefined;
        if (typeof body?.itemId !== "string") {
          return jsonResponse({ error: "itemId required", }, HttpStatus.BadRequest,);
        }

        const dismissed = body.dismissed !== false;
        await triageNewsItem(db, body.itemId, dismissed,);
        return jsonResponse({ itemId: body.itemId, dismissed, },);
      }, {
        body: t.Object({ itemId: t.String(), dismissed: t.Optional(t.Boolean(),), },),
        response: {
          200: t.Object({ itemId: t.String(), dismissed: t.Boolean(), },),
          403: ErrorResponse,
        },
      },)
      .get(`${prefix}/admin/model-news/weight-change/:modelId`, async (ctx: any,) => {
        const userId = requirePermissionUserId(ctx, "admin.system",);
        if (typeof userId !== "string") { return userId; }
        const modelId = decodeURIComponent(ctx.params.modelId as string,);
        const weightChange = await confirmWeightChange(db, modelId,);
        return jsonResponse({ modelId, weightChange, },);
      }, {
        response: {
          200: t.Object({ modelId: t.String(), weightChange: t.Boolean(), },),
          403: ErrorResponse,
        },
      },)
  );
}
