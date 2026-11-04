// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Professions Routes.
 *
 * Actor-discipline progression endpoints backed by `ProfessionsService`
 * (src/rpg/crafting/professions):
 *   POST /api/rpg/professions — assign a discipline to an actor
 *   GET /api/rpg/professions/actors/:actorId?worldId= — list actor professions
 *   GET /api/rpg/professions/:id — get one (with specializations)
 *   POST /api/rpg/professions/:id/xp — add XP (level-up + title)
 *   POST /api/rpg/professions/:id/specialize — unlock a specialization
 *
 * ROUTE-PATH DEVIATION (recorded on TASK-professions-service-routes): the
 * ticket sketches `GET/POST /api/actors/:actorId/professions`; the landed
 * sibling convention (`skills.ts`) scopes actor surfaces under
 * `/api/rpg/<domain>/actors/:actorId`, which is followed here.
 *
 * Actor-scoped routes are gated via `requireNsfwActorAccess` so the caller
 * must own the actor (or be admin/solo).
 */
import { Elysia, } from "elysia";
import { ProfessionsService, } from "../../rpg/crafting/professions";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import { requireNsfwActorAccess, } from "../nsfw/shared";
import { log, } from "./log";
import {
  actorIdParams,
  createProfessionBody,
  professionIdParams,
  professionSpecializeBody,
  professionsQuery,
  professionXpBody,
} from "./professions-schemas";
import type { HandlerOpts, } from "./types";

/** Errors the service throws that map to an HTTP status. */
function errorStatus(error: unknown,): 400 | 404 | 500 {
  const message = error instanceof Error ? error.message : "";
  if (message === "Profession not found") { return 404; }
  if (
    message.includes("already has",) || message.includes("requires level",) ||
    message.includes("must be a finite positive",) || message.includes("out of range",)
  ) {
    return 400;
  }

  return 500;
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 * @returns the professions Elysia plugin
 */
export function professionsRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const svc = (): ProfessionsService => new ProfessionsService(database,);
  const R = `${prefix}/rpg/professions`;

  return new Elysia({ name: "rpg-professions", },)
    // ── Assign discipline ─────────────────────────────────
    .post(R, async (ctx: any,) => {
      const body = ctx.body as { actorId: string };
      const userId = await requireNsfwActorAccess(database, body.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const profession = await svc().createProfession(ctx.body as never,);
        return jsonResponse(profession, 201,);
      } catch (error) {
        const status = errorStatus(error,);
        if (status === 500) {
          log().error("Failed to create profession", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }

        return jsonError(error instanceof Error ? error.message : "Invalid request", status,);
      }
    }, {
      body: createProfessionBody,
      response: { 201: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Assign profession",
        description: "Assign a crafting/gathering discipline to an actor.",
        tags: ["RPG", "Professions",],
      },
    },)
    // ── Actor professions ─────────────────────────────────
    .get(`${R}/actors/:actorId`, async (ctx: any,) => {
      const userId = await requireNsfwActorAccess(database, ctx.params.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const { worldId, } = ctx.query as { worldId?: string };
        const professions = await svc().getActorProfessions(ctx.params.actorId, worldId,);
        return jsonResponse({ professions, },);
      } catch (error) {
        log().error("Failed to list professions", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: actorIdParams,
      query: professionsQuery,
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "List actor professions",
        description: "List an actor's professions, optionally world-scoped (worldId='' matches the world-less scope).",
        tags: ["RPG", "Professions",],
      },
    },)
    // ── Get profession ────────────────────────────────────
    .get(`${R}/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const profession = await svc().getProfession(ctx.params.id,);
        if (!profession) { return notFoundResponse("Profession",); }
        return jsonResponse(profession,);
      } catch (error) {
        log().error("Failed to get profession", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: professionIdParams,
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get profession",
        description: "Get a single profession with its specializations.",
        tags: ["RPG", "Professions",],
      },
    },)
    // ── Add XP ────────────────────────────────────────────
    .post(`${R}/:id/xp`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const body = ctx.body as { amount: number };
        const result = await svc().addExperience(ctx.params.id, body.amount,);
        return jsonResponse(result,);
      } catch (error) {
        const status = errorStatus(error,);
        if (status === 500) {
          log().error("Failed to add profession XP", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }

        return status === 404
          ? notFoundResponse("Profession",)
          : jsonError(error instanceof Error ? error.message : "Invalid request", status,);
      }
    }, {
      params: professionIdParams,
      body: professionXpBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Add profession XP",
        description: "Add XP to a profession, possibly leveling it up and changing its title.",
        tags: ["RPG", "Professions",],
      },
    },)
    // ── Specialize ────────────────────────────────────────
    .post(`${R}/:id/specialize`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const specialization = await svc().addSpecialization(ctx.params.id, ctx.body as never,);
        return jsonResponse(specialization, 201,);
      } catch (error) {
        const status = errorStatus(error,);
        if (status === 500) {
          log().error("Failed to specialize profession", error instanceof Error ? error : undefined,);
          return jsonError("Internal server error", 500,);
        }

        return status === 404
          ? notFoundResponse("Profession",)
          : jsonError(error instanceof Error ? error.message : "Invalid request", status,);
      }
    }, {
      params: professionIdParams,
      body: professionSpecializeBody,
      response: { 201: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Specialize profession",
        description: "Unlock a specialization on a profession.",
        tags: ["RPG", "Professions",],
      },
    },);
}
