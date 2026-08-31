// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Skills progression routes — actor-scoped skill tree, prerequisites, XP and
 * specialization. Split from `skills.ts` to keep both files under the 250-line
 * ceiling.
 */
import { Elysia, t, } from "elysia";
import { type SkillCategory, SkillsService, } from "../../rpg/skills";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { requireActorAccess, } from "../nsfw/shared";
import { log, } from "./log";
import {
  actorParams,
  actorSkillsQuery,
  categoryParams,
  checkPrerequisitesBody,
  specializeBody,
  xpBody,
} from "./skills-schemas";
import type { HandlerOpts, } from "./types";

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function skillsProgressionRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const svc = (): SkillsService => new SkillsService(database,);
  const R = `${prefix}/rpg/skills`;

  return new Elysia({ name: "rpg-skills-progression", },)
    // ── Actor skills ─────────────────────────────────────
    .get(`${R}/actors/:actorId`, async (ctx: any,) => {
      const userId = await requireActorAccess(database, ctx.params.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const { worldId, } = ctx.query as { worldId?: string };
        const skills = await svc().getActorSkills(ctx.params.actorId, worldId,);
        return jsonResponse({ skills, },);
      } catch (error) {
        log().error("Failed to get actor skills", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: actorParams,
      query: actorSkillsQuery,
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Get actor skills",
        description: "Get all skills for an actor, optionally scoped to a world.",
        tags: ["RPG", "Skills",],
      },
    },)
    // ── Actor skills by category ─────────────────────────
    .get(`${R}/actors/:actorId/category/:category`, async (ctx: any,) => {
      const userId = await requireActorAccess(database, ctx.params.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const { worldId, } = ctx.query as { worldId?: string };
        const skills = await svc().getSkillsByCategory(
          ctx.params.actorId,
          ctx.params.category as SkillCategory,
          worldId,
        );
        return jsonResponse({ skills, },);
      } catch (error) {
        log().error("Failed to get skills by category", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: categoryParams,
      query: actorSkillsQuery,
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Get actor skills by category",
        description: "Get an actor's skills filtered by category.",
        tags: ["RPG", "Skills",],
      },
    },)
    // ── Actor skill tree ─────────────────────────────────
    .get(`${R}/actors/:actorId/tree`, async (ctx: any,) => {
      const userId = await requireActorAccess(database, ctx.params.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const { worldId, } = ctx.query as { worldId?: string };
        const tree = await svc().buildSkillTree(ctx.params.actorId, worldId,);
        return jsonResponse({ tree, },);
      } catch (error) {
        log().error("Failed to build skill tree", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: actorParams,
      query: actorSkillsQuery,
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Build actor skill tree",
        description: "Build the skill tree for an actor, optionally scoped to a world.",
        tags: ["RPG", "Skills",],
      },
    },)
    // ── Check prerequisites ──────────────────────────────
    .post(`${R}/prerequisites/check`, async (ctx: any,) => {
      const body = ctx.body as { actorId: string; prerequisites: string[]; worldId?: string };
      const userId = await requireActorAccess(database, body.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const result = await svc().checkPrerequisites(body.actorId, body.prerequisites, body.worldId,);
        return jsonResponse(result,);
      } catch (error) {
        log().error("Failed to check prerequisites", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      body: checkPrerequisitesBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Check skill prerequisites",
        description: "Check whether an actor meets a set of skill prerequisites.",
        tags: ["RPG", "Skills",],
      },
    },)
    // ── Add XP ───────────────────────────────────────────
    .post(`${R}/:id/xp`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const body = ctx.body as { xpAmount: number };
        const result = await svc().addXp(ctx.params.id, body.xpAmount,);
        return jsonResponse(result,);
      } catch (error) {
        log().error("Failed to add XP", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      body: xpBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Add skill XP",
        description: "Add XP to a skill, possibly triggering level-ups.",
        tags: ["RPG", "Skills",],
      },
    },)
    // ── Specialize ───────────────────────────────────────
    .post(`${R}/:id/specialize`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const body = ctx.body as { specialization: string };
        const skill = await svc().specializeSkill(ctx.params.id, body.specialization,);
        return jsonResponse(skill,);
      } catch (error) {
        log().error("Failed to specialize skill", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      body: specializeBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Specialize skill",
        description: "Specialize a skill to unlock enhanced effects.",
        tags: ["RPG", "Skills",],
      },
    },);
}
