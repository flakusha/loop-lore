/**
 * Model Comparison Routes
 *
 * Endpoints for tracking and querying model preference data.
 *
 *   POST   /api/analytics/comparisons          — Submit a comparison
 *   GET    /api/analytics/comparisons           — List recent comparisons
 *   GET    /api/analytics/comparisons/leaderboard — Aggregate stats by model
 */
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { HttpStatus, jsonError, jsonResponse, } from "./http-utils";

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

export function modelComparisonsRoutes({ database, }: HandleOpts,): Elysia {
  return new Elysia({ name: "model-comparisons", },)
    // ── POST /api/analytics/comparisons ────────────────────────
    .post("/api/analytics/comparisons", async (ctx: Record<string, unknown>,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: (ctx as any).t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const request = ctx.request as Request;
      let body: ComparisonBody;
      try {
        body = await request.json() as ComparisonBody;
      } catch {
        return jsonError({ message: "Invalid JSON body", status: 400, },);
      }

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

      const id = uid();
      const now = new Date().toISOString();

      await database
        .insertInto("model_comparisons",)
        .values({
          id,
          message_id: messageId,
          user_id: userId,
          reference_model: referenceModel,
          preference: preference as string,
          confidence,
          created_at: now,
        },)
        .executeTakeFirst();

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
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Submit a model comparison",
        description:
          "Record a user's preference between two models for a given message, with optional confidence score.",
        tags: ["Analytics", "Comparisons",],
      },
    },)
    // ── GET /api/analytics/comparisons/leaderboard ─────────────
    .get("/api/analytics/comparisons/leaderboard", async (ctx: Record<string, unknown>,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: (ctx as any).t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const rows = await database
        .selectFrom("model_comparisons",)
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

      const leaderboard = rows.map((r,) => ({
        reference_model: r.reference_model,
        totalComparisons: r.totalComparisons,
        betterCount: r.betterCount,
        worseCount: r.worseCount,
        sameCount: r.sameCount,
        avgConfidence: Math.round(r.avgConfidence * 100,) / 100,
      }));

      return jsonResponse({ leaderboard, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "Get model comparison leaderboard",
        description:
          "Aggregate comparison statistics grouped by reference model, including preference counts and average confidence.",
        tags: ["Analytics", "Comparisons",],
      },
    },)
    // ── GET /api/analytics/comparisons ─────────────────────────
    .get("/api/analytics/comparisons", async (ctx: Record<string, unknown>,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: (ctx as any).t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const query = ctx.query as Record<string, string> | undefined;
      const limit = Math.min(Math.max(Number(query?.limit,) || 50, 1,), 200,);

      const rows = await database
        .selectFrom("model_comparisons",)
        .selectAll()
        .orderBy("created_at", "desc",)
        .limit(limit,)
        .execute();

      return jsonResponse({ comparisons: rows, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
      },
      detail: {
        summary: "List recent comparisons",
        description: "Retrieve recent model comparisons for the authenticated user, ordered by creation date.",
        tags: ["Analytics", "Comparisons",],
      },
    },) as unknown as Elysia;
}
