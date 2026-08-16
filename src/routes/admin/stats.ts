// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { isAdminRole, } from "../../middleware/admin-gate";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * Admin stats — totals + daily deltas for the overview dashboard.
 *
 * Daily deltas count rows created since the start of today (UTC,
 * `datetime('now','start of day')`), matching the `datetime('now')`
 * default used by the schema.
 */
export function statsRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;
  // UTC start of today, matching SQLite `datetime('now')` text format (YYYY-MM-DD HH:MM:SS).
  const dayStart = new Date().toISOString().slice(0, 10,);

  return (
    new Elysia({ name: "admin-stats", },)
      // ── Stats ──────────────────────────────────────────────
      .get(`${prefix}/admin/stats`, async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!isAdminRole(userRole,)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const [
          userCountResult,
          chatCountResult,
          messageCountResult,
          characterCountResult,
          assetCountResult,
          worldCountResult,
          userDeltaResult,
          chatDeltaResult,
          worldDeltaResult,
          assetDeltaResult,
        ] = await Promise.allSettled([
          db.selectFrom("users",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
          db.selectFrom("chats",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
          db.selectFrom("messages",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
          db
            .selectFrom("actors",)
            .select(db.fn.countAll<number>().as("n",),)
            .where("actor_type", "=", "character" as any,)
            .executeTakeFirst(),
          db.selectFrom("assets",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
          db.selectFrom("worlds",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
          db
            .selectFrom("users",)
            .select(db.fn.countAll<number>().as("n",),)
            .where("created_at", ">=", dayStart,)
            .executeTakeFirst(),
          db
            .selectFrom("chats",)
            .select(db.fn.countAll<number>().as("n",),)
            .where("created_at", ">=", dayStart,)
            .executeTakeFirst(),
          db
            .selectFrom("worlds",)
            .select(db.fn.countAll<number>().as("n",),)
            .where("created_at", ">=", dayStart,)
            .executeTakeFirst(),
          db
            .selectFrom("assets",)
            .select(db.fn.countAll<number>().as("n",),)
            .where("created_at", ">=", dayStart,)
            .executeTakeFirst(),
        ],);
        // Counts are best-effort: a failed query yields 0 for that metric.
        const userCount = userCountResult.status === "fulfilled" ? userCountResult.value : undefined;
        const chatCount = chatCountResult.status === "fulfilled" ? chatCountResult.value : undefined;
        const messageCount = messageCountResult.status === "fulfilled" ? messageCountResult.value : undefined;
        const characterCount = characterCountResult.status === "fulfilled" ? characterCountResult.value : undefined;
        const assetCount = assetCountResult.status === "fulfilled" ? assetCountResult.value : undefined;
        const worldCount = worldCountResult.status === "fulfilled" ? worldCountResult.value : undefined;
        const userDelta = userDeltaResult.status === "fulfilled" ? userDeltaResult.value : undefined;
        const chatDelta = chatDeltaResult.status === "fulfilled" ? chatDeltaResult.value : undefined;
        const worldDelta = worldDeltaResult.status === "fulfilled" ? worldDeltaResult.value : undefined;
        const assetDelta = assetDeltaResult.status === "fulfilled" ? assetDeltaResult.value : undefined;

        return jsonResponse({
          users: userCount?.n ?? 0,
          chats: chatCount?.n ?? 0,
          messages: messageCount?.n ?? 0,
          characters: characterCount?.n ?? 0,
          assets: assetCount?.n ?? 0,
          worlds: worldCount?.n ?? 0,
          deltas: {
            users: userDelta?.n ?? 0,
            chats: chatDelta?.n ?? 0,
            worlds: worldDelta?.n ?? 0,
            assets: assetDelta?.n ?? 0,
          },
        },);
      }, {
        response: {
          200: t.Object({
            users: t.Number(),
            chats: t.Number(),
            messages: t.Number(),
            characters: t.Number(),
            assets: t.Number(),
            worlds: t.Number(),
            deltas: t.Object({
              users: t.Number(),
              chats: t.Number(),
              worlds: t.Number(),
              assets: t.Number(),
            },),
          },),
          403: ErrorResponse,
        },
      },)
  );
}
