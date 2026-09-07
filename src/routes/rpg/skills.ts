// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Skills Routes.
 *
 * CRUD + progression + skill-tree endpoints backed by `SkillsService`
 * (src/rpg/skills):
 *   GET/POST /api/rpg/skills
 *   GET/PUT/DELETE /api/rpg/skills/:id
 *   GET /api/rpg/skills/actors/:actorId?worldId=
 *   GET /api/rpg/skills/actors/:actorId/category/:category?worldId=
 *   GET /api/rpg/skills/actors/:actorId/tree?worldId=
 *   POST /api/rpg/skills/:id/xp
 *   POST /api/rpg/skills/:id/specialize
 *   POST /api/rpg/skills/prerequisites/check
 *
 * Actor-scoped routes are gated via `requireNsfwActorAccess` so the caller must
 * own the actor (or be admin/solo).
 */
import { Elysia, t, } from "elysia";
import { parseJsonField, } from "../../rpg/shared/rpg-service-utils";
import { SkillsService, } from "../../rpg/skills";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import { requireNsfwActorAccess, } from "../nsfw/shared";
import { log, } from "./log";
import {
  skillBody,
  skillsQuery,
  updateSkillBody,
} from "./skills-schemas";
import type { HandlerOpts, } from "./types";

/**
 * Minimal camelCase mapper for a raw character_skills row (global list).
 * @param row
 */
function rowToSkillLike(row: Record<string, unknown>,): Record<string, unknown> {
  return {
    id: row.id,
    actorId: row.actor_id,
    worldId: row.world_id,
    name: row.name,
    category: row.category,
    description: row.description,
    level: row.level,
    xp: row.xp,
    proficiency: row.proficiency,
    specialization: row.specialization,
    isLocked: row.lock_state === "locked",
    prerequisites: parseJsonField(row.prerequisites, [],),
    metadata: parseJsonField(row.metadata, {},),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 */
export function skillsRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const svc = (): SkillsService => new SkillsService(database,);
  const R = `${prefix}/rpg/skills`;

  return new Elysia({ name: "rpg-skills", },)
    // ── List skills ──────────────────────────────────────
    .get(R, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const { actorId, worldId, } = ctx.query as { actorId?: string; worldId?: string };
        if (actorId) {
          const skills = await svc().getActorSkills(actorId, worldId,);
          return jsonResponse({ skills, },);
        }
        let query = database.selectFrom("character_skills",).selectAll();
        if (worldId) { query = query.where("world_id", "=", worldId,); }
        const rows = await query.execute();
        const mapped = Array.from(rows, (r,) => rowToSkillLike(r,),);
        return jsonResponse({ skills: mapped, },);
      } catch (error) {
        log().error("Failed to list skills", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      query: skillsQuery,
      response: { 200: SuccessResponse, 401: ErrorResponse, },
      detail: {
        summary: "List skills",
        description: "List skills, optionally scoped to an actor or world.",
        tags: ["RPG", "Skills",],
      },
    },)
    // ── Create skill ─────────────────────────────────────
    .post(R, async (ctx: any,) => {
      const body = ctx.body as { actorId: string };
      const userId = await requireNsfwActorAccess(database, body.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const skill = await svc().createSkill(ctx.body as never,);
        return jsonResponse(skill, 201,);
      } catch (error) {
        log().error("Failed to create skill", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      body: skillBody,
      response: { 201: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Create skill",
        description: "Create a new skill for an actor.",
        tags: ["RPG", "Skills",],
      },
    },)
    // ── Get skill ────────────────────────────────────────
    .get(`${R}/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const skill = await svc().getSkill(ctx.params.id,);
        if (!skill) { return notFoundResponse("Skill",); }
        return jsonResponse(skill,);
      } catch (error) {
        log().error("Failed to get skill", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get skill",
        description: "Get a single skill by id.",
        tags: ["RPG", "Skills",],
      },
    },)
    // ── Update skill ─────────────────────────────────────
    .put(`${R}/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const body = ctx.body as Record<string, unknown>;
        const skill = await svc().updateSkill(ctx.params.id, body,);
        return jsonResponse(skill,);
      } catch (error) {
        log().error("Failed to update skill", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      body: updateSkillBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Update skill",
        description: "Update a skill's properties.",
        tags: ["RPG", "Skills",],
      },
    },)
    // ── Delete skill ─────────────────────────────────────
    .delete(`${R}/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const existing = await svc().getSkill(ctx.params.id,);
        if (!existing) { return notFoundResponse("Skill",); }
        await svc().deleteSkill(ctx.params.id,);
        return jsonResponse({ ok: true, },);
      } catch (error) {
        log().error("Failed to delete skill", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Delete skill",
        description: "Delete a skill.",
        tags: ["RPG", "Skills",],
      },
    },);
}
