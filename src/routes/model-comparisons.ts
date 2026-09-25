// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Persisted model comparison run routes.
 *
 *   GET  /api/comparisons              — List the user's runs
 *   POST /api/comparisons/:id/rating    — Rate one run
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { jsonParseOr, safeJsonStringify, } from "../utils/safe-json";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "./http-utils";

interface HandleOpts {
  database: Kysely<DB>;
}

interface ComparisonRunRow {
  id: string;
  user_id: string;
  prompt: string;
  results: string;
  ratings: string;
  metadata: string;
  created_at: string;
}

function parseObject(value: string,): Record<string, unknown> {
  return jsonParseOr<Record<string, unknown>>(value, {},);
}

function parseRun(row: ComparisonRunRow,): Record<string, unknown> {
  return {
    id: row.id,
    prompt: row.prompt,
    results: jsonParseOr(row.results, [],),
    ratings: parseObject(row.ratings,),
    metadata: parseObject(row.metadata,),
    createdAt: row.created_at,
  };
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function modelComparisonsRoutes({ database, }: HandleOpts, prefix = "/api",): Elysia {
  return new Elysia({ name: "model-comparisons", },)
    .get(`${prefix}/comparisons`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const query = (ctx.query ?? {}) as { limit?: string; offset?: string };
      const limit = Math.min(Math.max(Number(query.limit,) || 20, 1,), 100,);
      const offset = Math.max(Number(query.offset,) || 0, 0,);
      const rows = await database
        .selectFrom("model_comparison_runs",)
        .where("user_id", "=", userId,)
        .selectAll()
        .orderBy("created_at", "desc",)
        .limit(limit,)
        .offset(offset,)
        .execute();
      return jsonResponse({ comparisons: rows.map(parseRun,), limit, offset, },);
    }, {
      response: { 200: SuccessResponse, 401: ErrorResponse, },
    },)
    .post(`${prefix}/comparisons/:id/rating`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { id, } = ctx.params as { id: string };
      const body = ctx.body as { rating?: unknown; notes?: unknown };
      if (typeof body.rating !== "number" || body.rating < 1 || body.rating > 5) {
        return jsonError({ message: "rating must be a number between 1 and 5", status: 400, },);
      }
      if (body.notes !== undefined && typeof body.notes !== "string") {
        return jsonError({ message: "notes must be a string", status: 400, },);
      }
      const existing = await database
        .selectFrom("model_comparison_runs",)
        .select(["ratings",],)
        .where("id", "=", id,)
        .where("user_id", "=", userId,)
        .executeTakeFirst();
      if (!existing) { return jsonError({ message: "Comparison not found", status: 404, },); }
      const ratings = parseObject(existing.ratings,);
      ratings.overall = { rating: body.rating, notes: body.notes ?? "", };
      const ratingsJson = safeJsonStringify(ratings,);
      await database
        .updateTable("model_comparison_runs",)
        .set({ ratings: ratingsJson.ok ? ratingsJson.value : "{}", },)
        .where("id", "=", id,)
        .where("user_id", "=", userId,)
        .execute();
      return jsonResponse({ id, ratings, },);
    }, {
      body: t.Object({ rating: t.Number({ minimum: 1, maximum: 5, },), notes: t.Optional(t.String(),), },),
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
    },);
}
