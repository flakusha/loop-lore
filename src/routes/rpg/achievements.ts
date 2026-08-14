/**
 * Achievements Routes.
 *
 * Definitions CRUD + player-progress endpoints backed by `AchievementsService`
 * (src/rpg/achievements):
 *   GET/POST   /api/rpg/achievements
 *   GET/PUT/DELETE /api/rpg/achievements/:id
 *   GET        /api/rpg/achievements/player/:playerId
 *   GET        /api/rpg/achievements/player/:playerId/stats
 *   GET        /api/rpg/achievements/player/:playerId/:achievementId
 *   POST       /api/rpg/achievements/player/:playerId/:achievementId/progress
 *   POST       /api/rpg/achievements/player/:playerId/:achievementId/claim
 *
 * Player-progress routes are gated so a user may only read/mutate their own
 * achievements (playerId must equal the authenticated userId).
 */
import { Elysia, t, } from "elysia";
import { type AchievementCategory, AchievementsService, } from "../../rpg/achievements";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { forbiddenResponse, jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import {
  achievementBody,
  listAchievementsQuery,
  progressBody,
  updateAchievementBody,
} from "./achievements-schemas";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

/**
 * Require `playerId` to equal the authenticated user; returns userId string
 * on success, else a Response.
 */
function requireOwnPlayer(ctx: any, playerId: string,): string | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  if (playerId !== userId) { return forbiddenResponse(); }
  return userId;
}

export function achievementsRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const svc = (): AchievementsService => new AchievementsService(database,);
  const R = `${prefix}/rpg/achievements`;

  return new Elysia({ name: "rpg-achievements", },)
    // ── Definitions: list ────────────────────────────────
    .get(R, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const { category, includeSecret, } = ctx.query as {
          category?: AchievementCategory;
          includeSecret?: boolean;
        };
        const achievements = await svc().listAchievements(category, includeSecret ?? false,);
        return jsonResponse({ achievements, },);
      } catch (error) {
        log().error("Failed to list achievements", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: listAchievementsQuery,
      response: { 200: SuccessResponse, 401: ErrorResponse, },
      detail: {
        summary: "List achievements",
        description: "List achievement definitions, optionally filtered by category or including secret ones.",
        tags: ["RPG", "Achievements",],
      },
    },)
    // ── Definitions: create ──────────────────────────────
    .post(R, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const body = ctx.body as Record<string, unknown>;
        const achievement = await svc().createAchievement(body as never,);
        return jsonResponse(achievement, 201,);
      } catch (error) {
        log().error("Failed to create achievement", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      body: achievementBody,
      response: { 201: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, },
      detail: {
        summary: "Create achievement",
        description: "Create a new achievement definition.",
        tags: ["RPG", "Achievements",],
      },
    },)
    // ── Player: list ─────────────────────────────────────
    .get(`${R}/player/:playerId`, async (ctx: any,) => {
      const userId = requireOwnPlayer(ctx, ctx.params.playerId,);
      if (typeof userId !== "string") { return userId; }
      try {
        const progress = await svc().getPlayerAchievements(ctx.params.playerId,);
        return jsonResponse({ progress, },);
      } catch (error) {
        log().error("Failed to get player achievements", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ playerId: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "List player achievements",
        description: "Get all achievement progress records for a player.",
        tags: ["RPG", "Achievements",],
      },
    },)
    // ── Player: stats ────────────────────────────────────
    .get(`${R}/player/:playerId/stats`, async (ctx: any,) => {
      const userId = requireOwnPlayer(ctx, ctx.params.playerId,);
      if (typeof userId !== "string") { return userId; }
      try {
        const stats = await svc().getPlayerStats(ctx.params.playerId,);
        return jsonResponse(stats,);
      } catch (error) {
        log().error("Failed to get player stats", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ playerId: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Get player achievement stats",
        description: "Get aggregate achievement statistics (unlocked/available, by category and tier).",
        tags: ["RPG", "Achievements",],
      },
    },)
    // ── Player: single progress ──────────────────────────
    .get(`${R}/player/:playerId/:achievementId`, async (ctx: any,) => {
      const userId = requireOwnPlayer(ctx, ctx.params.playerId,);
      if (typeof userId !== "string") { return userId; }
      try {
        const progress = await svc().getPlayerAchievement(ctx.params.playerId, ctx.params.achievementId,);
        if (!progress) { return notFoundResponse("Player achievement",); }
        return jsonResponse(progress,);
      } catch (error) {
        log().error("Failed to get player achievement", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ playerId: t.String(), achievementId: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get player achievement progress",
        description: "Get a single player's progress toward one achievement.",
        tags: ["RPG", "Achievements",],
      },
    },)
    // ── Player: update progress ──────────────────────────
    .post(`${R}/player/:playerId/:achievementId/progress`, async (ctx: any,) => {
      const userId = requireOwnPlayer(ctx, ctx.params.playerId,);
      if (typeof userId !== "string") { return userId; }
      try {
        const body = ctx.body as { progressIncrement?: number };
        const result = await svc().updateProgress(
          ctx.params.playerId,
          ctx.params.achievementId,
          body.progressIncrement ?? 1,
        );
        return jsonResponse(result,);
      } catch (error) {
        log().error("Failed to update achievement progress", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ playerId: t.String(), achievementId: t.String(), },),
      body: progressBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Update achievement progress",
        description: "Increment a player's progress toward an achievement by the given amount.",
        tags: ["RPG", "Achievements",],
      },
    },)
    // ── Player: claim rewards ────────────────────────────
    .post(`${R}/player/:playerId/:achievementId/claim`, async (ctx: any,) => {
      const userId = requireOwnPlayer(ctx, ctx.params.playerId,);
      if (typeof userId !== "string") { return userId; }
      try {
        const rewards = await svc().claimRewards(ctx.params.playerId, ctx.params.achievementId,);
        return jsonResponse({ rewards, },);
      } catch (error) {
        log().error("Failed to claim rewards", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ playerId: t.String(), achievementId: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Claim achievement rewards",
        description: "Claim the rewards for an unlocked achievement.",
        tags: ["RPG", "Achievements",],
      },
    },)
    // ── Definitions: get one ─────────────────────────────
    .get(`${R}/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const achievement = await svc().getAchievement(ctx.params.id,);
        if (!achievement) { return notFoundResponse("Achievement",); }
        return jsonResponse(achievement,);
      } catch (error) {
        log().error("Failed to get achievement", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get achievement",
        description: "Get a single achievement definition by id.",
        tags: ["RPG", "Achievements",],
      },
    },)
    // ── Definitions: update ──────────────────────────────
    .put(`${R}/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const body = ctx.body as Record<string, unknown>;
        const achievement = await svc().updateAchievement(ctx.params.id, body,);
        return jsonResponse(achievement,);
      } catch (error) {
        log().error("Failed to update achievement", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      body: updateAchievementBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Update achievement",
        description: "Update an achievement definition's properties.",
        tags: ["RPG", "Achievements",],
      },
    },)
    // ── Definitions: delete ──────────────────────────────
    .delete(`${R}/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const existing = await svc().getAchievement(ctx.params.id,);
        if (!existing) { return notFoundResponse("Achievement",); }
        await svc().deleteAchievement(ctx.params.id,);
        return jsonResponse({ ok: true, },);
      } catch (error) {
        log().error("Failed to delete achievement", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Delete achievement",
        description: "Delete an achievement definition.",
        tags: ["RPG", "Achievements",],
      },
    },);
}
