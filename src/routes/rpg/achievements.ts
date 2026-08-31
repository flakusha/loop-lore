// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
import { jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import {
  achievementBody,
  listAchievementsQuery,
  updateAchievementBody,
} from "./achievements-schemas";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
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
