import { Elysia, t, } from "elysia";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { extractAuth, } from "../http-utils";
import {
  handleCreateLocation,
  handleDeleteLocation,
  handleGetLocation,
  handleListLocations,
  handleUpdateLocation,
} from "./locations";
import type { HandleOpts, } from "./types";

export function locationRoutes(opts: HandleOpts,) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-locations", },)
    .get(
      "/api/worlds/:worldId/locations",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const page = Number(ctx.query?.page,) || 1;
        const pageSize = Number(ctx.query?.pageSize,) || 20;
        return handleListLocations(database, ctx.params.worldId as string, page, pageSize, userId, userRole,);
      },
      {
        response: {
          200: t.Object({ data: t.Array(t.Any(),), total: t.Number(), page: t.Number(), pageSize: t.Number(), },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "List locations",
          description: "List locations in a world.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      "/api/worlds/:worldId/locations",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleCreateLocation(
          database,
          ctx.params.worldId as string,
          ctx.body as Record<string, unknown>,
          userId,
          userRole,
        );
      },
      {
        response: {
          201: t.Object({ id: t.String(), },),
          400: ErrorResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Create location",
          description: "Create a new location in a world.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      "/api/worlds/:worldId/locations/:locId",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleGetLocation(
          database,
          ctx.params.worldId as string,
          ctx.params.locId as string,
          userId,
          userRole,
        );
      },
      {
        response: {
          200: t.Any(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get location",
          description: "Get a location by ID.",
          tags: ["Worlds",],
        },
      },
    )
    .put(
      "/api/worlds/:worldId/locations/:locId",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleUpdateLocation(
          database,
          ctx.params.worldId as string,
          ctx.params.locId as string,
          ctx.body as Record<string, unknown>,
          userId,
          userRole,
        );
      },
      {
        response: {
          200: SuccessResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Update location",
          description: "Update a location's properties.",
          tags: ["Worlds",],
        },
      },
    )
    .delete(
      "/api/worlds/:worldId/locations/:locId",
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        return handleDeleteLocation(
          database,
          ctx.params.worldId as string,
          ctx.params.locId as string,
          userId,
          userRole,
        );
      },
      {
        response: {
          204: t.Void(),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Delete location",
          description: "Delete a location from a world.",
          tags: ["Worlds",],
        },
      },
    );
}
