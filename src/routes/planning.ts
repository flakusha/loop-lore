// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Planning Routes
 *
 * REST API for plan items:
 *   GET    /api/plans              — list plan items for current user
 *   POST   /api/plans              — create a plan item
 *   GET    /api/plans/:id          — get a single plan item
 *   PATCH  /api/plans/:id          — update a plan item
 *   DELETE /api/plans/:id          — delete a plan item
 *   POST   /api/plans/:id/advance  — advance state machine
 *   POST   /api/plans/:id/links    — add a link between plan items
 *   GET    /api/plans/:id/links    — list links for a plan item
 *
 * Elysia plugin — uses auth guard for authentication (context.userId available).
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { PlanItemKind, PlanItemState, PlanLinkRelation, } from "../db/enums-story/plans";
import type { DB, } from "../db/schema";
import { createPlanningService, type PlanningService, } from "../planning/service";
import { jsonError, jsonResponse, requireUserId, } from "./http-utils";

/**
 * @param opts
 * @param opts.database
 * @param prefix
 */
export function planningRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  const service: PlanningService = createPlanningService(database,);

  return new Elysia({ name: "planning", },)
    .get(
      `${prefix}/plans`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }
        const items = await service.list(userId,);
        return jsonResponse(items,);
      },
      {
        response: {
          200: t.Array(
            t.Object({
              id: t.String(),
              owner_id: t.String(),
              chat_id: t.Union([t.String(), t.Null(),],),
              title: t.String(),
              state: t.String(),
              kind: t.String(),
              position: t.Number(),
              parent_id: t.Union([t.String(), t.Null(),],),
              created_at: t.String(),
              updated_at: t.String(),
            },),
          ),
        },
      },
    )
    .post(
      `${prefix}/plans`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }
        const body = ctx.body as Record<string, unknown>;
        if (!body.title || typeof body.title !== "string") {
          return jsonError("title is required", 400,);
        }

        const item = await service.create({
          owner_id: userId,
          title: body.title,
          chat_id: body.chat_id as string | null | undefined,
          kind: body.kind as PlanItemKind | undefined,
          position: body.position as number | undefined,
          parent_id: body.parent_id as string | null | undefined,
        },);

        return jsonResponse(item, 201,);
      },
      {
        body: t.Object({
          title: t.String(),
          chat_id: t.Optional(t.Union([t.String(), t.Null(),],),),
          kind: t.Optional(t.String(),),
          position: t.Optional(t.Number(),),
          parent_id: t.Optional(t.Union([t.String(), t.Null(),],),),
        },),
      },
    )
    .get(
      `${prefix}/plans/:id`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }
        const item = await service.get(ctx.params.id,);
        if (!item || item.owner_id !== userId) {
          return jsonError("Not found", 404,);
        }

        return jsonResponse(item,);
      },
      {
        response: {
          200: t.Object({
            id: t.String(),
            owner_id: t.String(),
            chat_id: t.Union([t.String(), t.Null(),],),
            title: t.String(),
            state: t.String(),
            kind: t.String(),
            position: t.Number(),
            parent_id: t.Union([t.String(), t.Null(),],),
            created_at: t.String(),
            updated_at: t.String(),
          },),
        },
      },
    )
    .patch(
      `${prefix}/plans/:id`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }
        const existing = await service.get(ctx.params.id,);
        if (!existing || existing.owner_id !== userId) {
          return jsonError("Not found", 404,);
        }

        const body = ctx.body as Record<string, unknown>;
        const item = await service.update(ctx.params.id, {
          title: body.title as string | undefined,
          kind: body.kind as PlanItemKind | undefined,
          position: body.position as number | undefined,
          parent_id: body.parent_id as string | null | undefined,
        },);

        if (!item) { return jsonError("Not found", 404,); }
        return jsonResponse(item,);
      },
      {
        body: t.Object({
          title: t.Optional(t.String(),),
          kind: t.Optional(t.String(),),
          position: t.Optional(t.Number(),),
          parent_id: t.Optional(t.Union([t.String(), t.Null(),],),),
        },),
      },
    )
    .delete(
      `${prefix}/plans/:id`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }
        const existing = await service.get(ctx.params.id,);
        if (!existing || existing.owner_id !== userId) {
          return jsonError("Not found", 404,);
        }

        await service.delete(ctx.params.id,);
        return new Response(null, { status: 204, },);
      },
    )
    .post(
      `${prefix}/plans/:id/advance`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }
        const existing = await service.get(ctx.params.id,);
        if (!existing || existing.owner_id !== userId) {
          return jsonError("Not found", 404,);
        }

        const body = ctx.body as Record<string, unknown>;
        const target = body.state as PlanItemState;
        if (!Object.values(PlanItemState,).includes(target,)) {
          return jsonError("Invalid state", 400,);
        }

        try {
          const item = await service.advance(ctx.params.id, target,);
          if (!item) { return jsonError("Not found", 404,); }
          return jsonResponse(item,);
        } catch (err) {
          return jsonError((err as Error).message, 409,);
        }
      },
      { body: t.Object({ state: t.String(), },), },
    )
    .post(
      `${prefix}/plans/:id/links`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }
        const existing = await service.get(ctx.params.id,);
        if (!existing || existing.owner_id !== userId) {
          return jsonError("Not found", 404,);
        }

        const body = ctx.body as Record<string, unknown>;
        const toId = body.to_id as string;
        const relation = body.relation as PlanLinkRelation;
        if (!toId || !relation) {
          return jsonError("to_id and relation are required", 400,);
        }

        const target = await service.get(toId,);
        if (!target || target.owner_id !== userId) {
          return jsonError("Target not found", 404,);
        }

        const link = await service.addLink(ctx.params.id, toId, relation,);
        return jsonResponse(link, 201,);
      },
      { body: t.Object({ to_id: t.String(), relation: t.String(), },), },
    )
    .get(
      `${prefix}/plans/:id/links`,
      async (ctx,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }
        const existing = await service.get(ctx.params.id,);
        if (!existing || existing.owner_id !== userId) {
          return jsonError("Not found", 404,);
        }

        const links = await service.listLinks(ctx.params.id,);
        return jsonResponse(links,);
      },
      {
        response: {
          200: t.Array(
            t.Object({ from_id: t.String(), to_id: t.String(), relation: t.String(), created_at: t.String(), },),
          ),
        },
      },
    );
}
