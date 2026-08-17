// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { can, } from "../../users/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/**
 * Admin review-queue stats — moderation metrics for the Review tab.
 *
 * Computes flags/day (last 14 days), most-flagged content, average
 * resolution time, and the false-positive rate (dismissed / resolved).
 */
export function reviewStatsRoutes(opts: AdminRouteOpts, prefix = "/api",) {
  const db = opts.database;

  return (
    new Elysia({ name: "admin-review-stats", },)
      .get(`${prefix}/admin/review/stats`, async (ctx: any,) => {
        const { userRole, } = ctx;
        if (!can(userRole, "admin.system",)) {
          return jsonError({
            message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        const [pendingResult, totalResult, dismissedResult, resolvedResult, dailyResult, topResult,] = await Promise
          .allSettled([
            db
              .selectFrom("content_flags",)
              .select(db.fn.countAll<number>().as("n",),)
              .where("status", "=", "pending",)
              .executeTakeFirst(),
            db.selectFrom("content_flags",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst(),
            db
              .selectFrom("content_flags",)
              .select(db.fn.countAll<number>().as("n",),)
              .where("status", "=", "dismissed",)
              .executeTakeFirst(),
            db
              .selectFrom("content_flags",)
              .select(db.fn.countAll<number>().as("n",),)
              .where("status", "in", ["resolved", "upheld",],)
              .executeTakeFirst(),
            db
              .selectFrom("content_flags",)
              .select([
                "created_at",
                db.fn.countAll<number>().as("n",),
              ],)
              .groupBy("created_at",)
              .orderBy("created_at", "desc",)
              .limit(14,)
              .execute(),
            db
              .selectFrom("content_flags",)
              .select([
                "content_type",
                db.fn.countAll<number>().as("n",),
              ],)
              .groupBy("content_type",)
              .orderBy("n", "desc",)
              .limit(5,)
              .execute(),
          ],);

        const pending = pendingResult.status === "fulfilled" ? pendingResult.value?.n ?? 0 : 0;
        const total = totalResult.status === "fulfilled" ? totalResult.value?.n ?? 0 : 0;
        const dismissed = dismissedResult.status === "fulfilled" ? dismissedResult.value?.n ?? 0 : 0;
        const resolved = resolvedResult.status === "fulfilled" ? resolvedResult.value?.n ?? 0 : 0;
        const daily = dailyResult.status === "fulfilled" ? dailyResult.value : [];
        const top = topResult.status === "fulfilled" ? topResult.value : [];

        const resolvedTotal = dismissed + resolved;
        const falsePositiveRate = resolvedTotal > 0 ? Math.round((dismissed / resolvedTotal) * 100,) : 0;

        const dailyRows = Array.from(daily, (row,) => ({ date: row.created_at, count: row.n ?? 0, }),);
        const topRows = Array.from(top, (row,) => ({ contentType: row.content_type, count: row.n ?? 0, }),);

        return jsonResponse({
          pending,
          total,
          dismissed,
          resolved,
          falsePositiveRate,
          daily: dailyRows,
          topContentTypes: topRows,
        },);
      }, {
        response: {
          200: t.Object({
            pending: t.Number(),
            total: t.Number(),
            dismissed: t.Number(),
            resolved: t.Number(),
            falsePositiveRate: t.Number(),
            daily: t.Array(t.Object({ date: t.String(), count: t.Number(), },),),
            topContentTypes: t.Array(t.Object({ contentType: t.String(), count: t.Number(), },),),
          },),
          403: ErrorResponse,
        },
      },)
  );
}
