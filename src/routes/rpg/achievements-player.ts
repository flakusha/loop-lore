/**
 * Achievements player-progress routes — own-player gated progress/stats/claim
 * endpoints. Split from `achievements.ts` to keep both files under the
 * 250-line ceiling.
 */
import { Elysia, t, } from "elysia";
import { AchievementsService, } from "../../rpg/achievements";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { forbiddenResponse, jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import { progressBody, } from "./achievements-schemas";
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

export function achievementsPlayerRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const svc = (): AchievementsService => new AchievementsService(database,);
  const R = `${prefix}/rpg/achievements`;

  return new Elysia({ name: "rpg-achievements-player", },)
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
    },);
}
