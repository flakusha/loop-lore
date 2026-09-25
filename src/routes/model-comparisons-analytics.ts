// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Legacy preference analytics routes kept separate from run comparison storage. */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "./http-utils";

interface HandleOpts {
  database: Kysely<DB>;
}

interface ComparisonBody {
  messageId: unknown;
  referenceModel: unknown;
  preference: unknown;
  confidence: unknown;
}

const VALID_PREFERENCES = ["better", "worse", "same",] as const;

/** @param root0 @param prefix */
export function modelComparisonsAnalyticsRoutes(
  { database, }: HandleOpts,
  prefix = "/api",
): Elysia {
  return new Elysia({ name: "model-comparisons-analytics", },)
    .post(`${prefix}/analytics/comparisons`, async (ctx: Record<string, unknown>,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const body = ctx.body as ComparisonBody;
      const { messageId, referenceModel, preference, confidence, } = body;
      if (typeof messageId !== "string" || !messageId) {
        return jsonError({
          message: (ctx as any).t?.("modelComparisons.messageIdRequired",) ?? "messageId is required (string)",
          status: 400,
        },);
      }
      if (typeof referenceModel !== "string" || !referenceModel) {
        return jsonError({
          message: (ctx as any).t?.("modelComparisons.referenceModelRequired",) ??
            "referenceModel is required (string)",
          status: 400,
        },);
      }
      if (!VALID_PREFERENCES.includes(preference as (typeof VALID_PREFERENCES)[number],)) {
        return jsonError({
          message: (ctx as any).t?.("modelComparisons.invalidPreference",) ??
            "preference must be one of: better, worse, same",
          status: 400,
        },);
      }
      if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
        return jsonError({ message: "confidence must be a number between 0 and 1", status: 400, },);
      }
      const owned = await database
        .selectFrom("messages",)
        .innerJoin("chats", "chats.id", "messages.chat_id",)
        .select("messages.id",)
        .where("messages.id", "=", messageId,)
        .where("chats.created_by", "=", userId,)
        .executeTakeFirst();
      if (!owned) {
        return jsonError({ message: "messageId does not belong to the authenticated user", status: 400, },);
      }
      const id = uid();
      const now = new Date().toISOString();
      await database.insertInto("model_comparisons",).values({
        id,
        message_id: messageId,
        user_id: userId,
        reference_model: referenceModel,
        preference: preference as string,
        confidence,
        created_at: now,
      },).executeTakeFirst();
      return jsonResponse({
        id,
        message_id: messageId,
        user_id: userId,
        reference_model: referenceModel,
        preference,
        confidence,
        created_at: now,
      }, 201,);
    }, {
      response: { 201: SuccessResponse, 401: ErrorResponse, },
      detail: {
        summary: "Submit a model comparison",
        description:
          "Record a user's preference between two models for a given message, with optional confidence score.",
        tags: ["Analytics", "Comparisons",],
      },
    },)
    .get(`${prefix}/analytics/comparisons/leaderboard`, async (ctx: Record<string, unknown>,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const rows = await database
        .selectFrom("model_comparisons",)
        .where("user_id", "=", userId,)
        .select([
          "reference_model",
          sql<number>`count(*)`.as("totalComparisons",),
          sql<number>`sum(CASE WHEN preference = 'better' THEN 1 ELSE 0 END)`.as("betterCount",),
          sql<number>`sum(CASE WHEN preference = 'worse' THEN 1 ELSE 0 END)`.as("worseCount",),
          sql<number>`sum(CASE WHEN preference = 'same' THEN 1 ELSE 0 END)`.as("sameCount",),
          sql<number>`avg(confidence)`.as("avgConfidence",),
        ],)
        .groupBy("reference_model",)
        .orderBy(sql<number>`count(*)`, "desc",)
        .execute();
      const leaderboard = Array.from(rows, (row,) => ({
        reference_model: row.reference_model,
        totalComparisons: row.totalComparisons,
        betterCount: row.betterCount,
        worseCount: row.worseCount,
        sameCount: row.sameCount,
        avgConfidence: row.avgConfidence == null ? null : Math.round(row.avgConfidence * 100,) / 100,
      }),);
      return jsonResponse({ leaderboard, },);
    }, {
      response: { 200: SuccessResponse, 401: ErrorResponse, },
      detail: {
        summary: "Get model comparison leaderboard",
        description:
          "Aggregate comparison statistics grouped by reference model, including preference counts and average confidence.",
        tags: ["Analytics", "Comparisons",],
      },
    },)
    .get(`${prefix}/analytics/comparisons`, async (ctx: Record<string, unknown>,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const query = ctx.query as Record<string, string> | undefined;
      const limit = Math.min(Math.max(Number(query?.limit,) || 50, 1,), 200,);
      const rows = await database.selectFrom("model_comparisons",).selectAll().where("user_id", "=", userId,).orderBy(
        "created_at",
        "desc",
      ).limit(limit,).execute();
      return jsonResponse({ comparisons: rows, },);
    }, {
      response: { 200: SuccessResponse, 401: ErrorResponse, },
      detail: {
        summary: "List recent comparisons",
        description: "Retrieve recent model comparisons for the authenticated user, ordered by creation date.",
        tags: ["Analytics", "Comparisons",],
      },
    },);
}
