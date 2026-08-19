// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { ErrorResponse, SuccessResponse, WorldCreateBody, WorldUpdateBody, } from "../../validation/schemas";
import { buildWorldBundle, } from "../export-shared";
import { prettyJson, } from "../export-shared/helpers";
import { extractAuth, HttpStatus, jsonError, } from "../http-utils";
import { requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";
import {
  handleCreateWorld,
  handleDeleteWorld,
  handleGetWorld,
  handleInitializeStates,
  handleListWorlds,
  handleUpdateWorld,
} from "./worlds";

export function worldRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-crud", },)
    .get(
      `${prefix}/worlds`,
      async (ctx: any,) => {
        const { userId, } = extractAuth(ctx,);
        const page = Number(ctx.query?.page,) || 1;
        const pageSize = Number(ctx.query?.pageSize,) || 20;
        return handleListWorlds(database, page, pageSize, userId,);
      },
      {
        response: {
          200: t.Object({ data: t.Array(t.Any(),), total: t.Number(), page: t.Number(), pageSize: t.Number(), },),
          401: ErrorResponse,
        },
        detail: {
          summary: "List worlds",
          description: "List all worlds visible to the authenticated user.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds`,
      async (ctx: any,) => {
        const { userId, } = extractAuth(ctx,);
        return handleCreateWorld(database, ctx.body as Record<string, unknown>, userId,);
      },
      {
        body: WorldCreateBody,
        response: {
          201: t.Object({ id: t.String(), },),
          401: ErrorResponse,
        },
        detail: {
          summary: "Create world",
          description: "Create a new world. Requires authentication.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleGetWorld(database, ctx.params.worldId as string, userId, userRole,);
      },
      {
        response: {
          200: t.Any(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get world",
          description: "Get a world by ID with its locations.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/export`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldId = ctx.params.worldId as string;
        const denied = await requireWorldOwner(database, worldId, userId, userRole,);
        if (denied) { return denied; }
        const bundle = await buildWorldBundle(database, worldId,);
        if (!bundle) {
          return jsonError({ message: "World not found", status: HttpStatus.NotFound, },);
        }
        const safeName = (bundle.world.name ?? worldId).replaceAll(/[^a-z0-9]/gi, "_",).toLowerCase();
        return new Response(prettyJson(bundle,), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${safeName}.world.json"`,
          },
        },);
      },
      {
        response: {
          200: t.Any(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Export world",
          description:
            "Download a world (locations, lore, quests, states) as a round-trippable WorldBundle JSON, importable via POST /api/import/world. Owner only.",
          tags: ["Worlds",],
        },
      },
    )
    .put(
      `${prefix}/worlds/:worldId`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleUpdateWorld(
          database,
          ctx.params.worldId as string,
          ctx.body as Record<string, unknown>,
          userId,
          userRole,
        );
      },
      {
        body: WorldUpdateBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Update world",
          description: "Update a world's properties. Owner or admin only.",
          tags: ["Worlds",],
        },
      },
    )
    .delete(
      `${prefix}/worlds/:worldId`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleDeleteWorld(database, ctx.params.worldId as string, userId, userRole,);
      },
      {
        response: {
          204: t.Void(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Delete world",
          description: "Delete a world and all its locations. Owner or admin only.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/initialize-states`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleInitializeStates(database, ctx.params.worldId as string, userId, userRole,);
      },
      {
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Initialize world states",
          description: "Initialize default state machines for a world's locations and NPCs.",
          tags: ["Worlds",],
        },
      },
    );
}
