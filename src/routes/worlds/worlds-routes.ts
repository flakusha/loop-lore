import { Elysia, t, } from "elysia";
import { ErrorResponse, SuccessResponse, WorldCreateBody, WorldUpdateBody, } from "../../validation/schemas";
import { extractAuth, } from "../http-utils";
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
